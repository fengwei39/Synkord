package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
	"gorm.io/gorm"
)

// fakeAuth 把 user_id 塞进 context，跳过 JWT 校验。
// swagger_specs 端点只读 c.GetString("user_id")，这个 stub 等价于
// 一个登录好的普通用户。
func fakeAuth(userID string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	}
}

// newTestEngine 装配一个最小可用的 gin 引擎，绑上 swagger_specs 路由。
// 共享 *gorm.DB，方便各 test 复用 Setup helper 准备数据。
//
// userName 必须全局唯一，因为底层用 file::memory:?cache=shared，
// 多 test 共用一个 SQLite 实例，username 有 unique 约束。
func newTestEngine(t *testing.T, userName string) (*gin.Engine, *models.User, *services.TeamWithRole, *models.Project) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testDB(t)
	database.DB = db

	user := &models.User{Username: userName, HashedPassword: "x", Role: models.RoleAdmin, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	team, err := services.CreateTeam(db, user.ID, "Swagger Test Team "+userName, "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	project := &models.Project{TeamID: team.ID, Name: "svc-" + userName, ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	r := gin.New()
	r.Use(fakeAuth(user.ID))
	RegisterTeamSwaggerSpecRoutes(r.Group(""))
	return r, user, team, project
}

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.Team{},
		&models.TeamMember{},
		&models.Project{},
		&models.SwaggerSpec{},
		&models.APIEndpoint{},
		&models.Entity{},
		&models.EntityVersion{},
		&models.Dependency{},
		&models.ChangeSet{},
		&models.Notification{},
		&models.TeamMCPSetting{},
		&models.MCPConfig{},
		&models.MCPAuditLog{},
		&models.GlobalMCPServerConfig{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return db
}

func doRequest(r *gin.Engine, method, path string, body any) (*httptest.ResponseRecorder, map[string]any) {
	var reader *bytes.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	var resp map[string]any
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
	}
	return w, resp
}

func TestSwaggerSpecsImportCreatesVersion(t *testing.T) {
	r, _, team, project := newTestEngine(t, "u-import")

	// 第一次导入：带 info.version=1.0.0 → 直接采用
	spec1 := `{
	  "openapi": "3.0.0",
	  "info": { "title": "User API", "version": "1.0.0" },
	  "paths": {
	    "/users": { "get": { "summary": "List users", "responses": { "200": { "description": "OK" } } } }
	  }
	}`

	w, resp := doRequest(r, "POST", "/teams/"+team.ID+"/swagger-specs/import", map[string]any{
		"project_id": project.ID,
		"spec":       spec1,
		"format":     "openapi",
		"note":       "first import",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if resp["spec_version"] != "1.0.0" {
		t.Fatalf("spec_version = %v, want 1.0.0", resp["spec_version"])
	}
	if resp["spec_name"] != "User API" {
		t.Fatalf("spec_name = %v, want User API", resp["spec_name"])
	}
	if resp["spec_id"] == nil || resp["spec_id"] == "" {
		t.Fatalf("spec_id missing in response: %+v", resp)
	}

	// 第二次导入：不带 info.version → 应自动 patch bump 到 1.0.1
	spec2 := `{
	  "openapi": "3.0.0",
	  "info": { "title": "User API" },
	  "paths": {
	    "/users": { "get": { "summary": "List users v2", "responses": { "200": { "description": "OK" } } } }
	  }
	}`
	w2, resp2 := doRequest(r, "POST", "/teams/"+team.ID+"/swagger-specs/import", map[string]any{
		"project_id": project.ID,
		"spec":       spec2,
		"format":     "openapi",
	})
	if w2.Code != http.StatusOK {
		t.Fatalf("second import status = %d, body = %s", w2.Code, w2.Body.String())
	}
	if resp2["spec_version"] != "1.0.1" {
		t.Fatalf("second.spec_version = %v, want 1.0.1 (auto patch)", resp2["spec_version"])
	}
}

func TestSwaggerSpecsListReturnsOnlyCurrentTeam(t *testing.T) {
	r1, _, teamA, projectA := newTestEngine(t, "ua-list")
	r2, _, teamB, projectB := newTestEngine(t, "ub-list")
	_ = r2 // r2 共享数据库但用不同 user_id 装载

	// 在 A 团队下导入一个 spec
	spec := `{"openapi":"3.0.0","info":{"title":"A"},"paths":{}}`
	if w, _ := doRequest(r1, "POST", "/teams/"+teamA.ID+"/swagger-specs/import", map[string]any{
		"project_id": projectA.ID, "spec": spec, "format": "openapi",
	}); w.Code != http.StatusOK {
		t.Fatalf("teamA import failed: %d %s", w.Code, w.Body.String())
	}

	// A 团队用户查列表应看到 1 条
	wA, bodyA := doRequest(r1, "GET", "/teams/"+teamA.ID+"/swagger-specs?project_id="+projectA.ID, nil)
	if wA.Code != http.StatusOK {
		t.Fatalf("list teamA status = %d", wA.Code)
	}
	if int(bodyA["total"].(float64)) != 1 {
		t.Fatalf("teamA total = %v, want 1", bodyA["total"])
	}

	// B 团队的 user 用 r2（fakeAuth 不同）查自己团队应该 0 条
	wB, bodyB := doRequest(r2, "GET", "/teams/"+teamB.ID+"/swagger-specs?project_id="+projectB.ID, nil)
	if wB.Code != http.StatusOK {
		t.Fatalf("list teamB status = %d", wB.Code)
	}
	if int(bodyB["total"].(float64)) != 0 {
		t.Fatalf("teamB total = %v, want 0 (隔离)", bodyB["total"])
	}
}

func TestSwaggerSpecsGetByID(t *testing.T) {
	r, _, team, project := newTestEngine(t, "u-get")
	spec := `{"openapi":"3.0.0","info":{"title":"X"},"paths":{}}`
	w, resp := doRequest(r, "POST", "/teams/"+team.ID+"/swagger-specs/import", map[string]any{
		"project_id": project.ID, "spec": spec, "format": "openapi",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("import: %d %s", w.Code, w.Body.String())
	}
	specID := resp["spec_id"].(string)

	wGet, bodyGet := doRequest(r, "GET", "/teams/"+team.ID+"/swagger-specs/"+specID, nil)
	if wGet.Code != http.StatusOK {
		t.Fatalf("get spec status = %d", wGet.Code)
	}
	if bodyGet["id"] != specID {
		t.Fatalf("get id = %v, want %s", bodyGet["id"], specID)
	}
	if bodyGet["spec_content"] != spec {
		t.Fatalf("spec_content mismatch")
	}
}

func TestValidateDependenciesDetectsMissingReferences(t *testing.T) {
	r, _, team, project := newTestEngine(t, "u-val-miss")
	// 导入 baseline：包含 UserDTO 和 GET /users
	spec := `{
	  "openapi": "3.0.0",
	  "info": { "title": "User API" },
	  "paths": {
	    "/users": { "get": { "summary": "List", "responses": { "200": { "description": "OK" } } } }
	  },
	  "components": {
	    "schemas": {
	      "UserDTO": { "type": "object", "properties": { "id": { "type": "string" } } }
	    }
	  }
	}`
	if w, _ := doRequest(r, "POST", "/teams/"+team.ID+"/swagger-specs/import", map[string]any{
		"project_id": project.ID, "spec": spec, "format": "openapi",
	}); w.Code != http.StatusOK {
		t.Fatalf("baseline import failed: %d %s", w.Code, w.Body.String())
	}

	// 消费方声明引用了 UserDTO 和 GET /users，以及一个不存在的 OrderDTO
	w, body := doRequest(r, "POST", "/teams/"+team.ID+"/validate/dependencies", map[string]any{
		"project_id":     project.ID,
		"pinned_version": "1.0.0",
		"used_entities":  []string{"UserDTO", "OrderDTO"},
		"used_apis":      []string{"GET /users", "POST /orders"},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("validate status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["ok"] != false {
		t.Fatalf("ok = %v, want false (OrderDTO + POST /orders missing)", body["ok"])
	}
	breaking := body["breaking"].([]any)
	if len(breaking) != 2 {
		t.Fatalf("breaking len = %d, want 2, body = %+v", len(breaking), body)
	}
}

func TestValidateDependenciesWarnsOnNoBaseline(t *testing.T) {
	r, _, team, project := newTestEngine(t, "u-val-nobaseline")
	// 不导入任何 spec，直接 validate
	w, body := doRequest(r, "POST", "/teams/"+team.ID+"/validate/dependencies", map[string]any{
		"project_id":    project.ID,
		"used_entities": []string{"UserDTO"},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("validate status = %d, body = %s", w.Code, w.Body.String())
	}
	// 无 baseline 时 ok=true（不阻塞），但应该返回 warning
	if body["ok"] != true {
		t.Fatalf("ok = %v, want true (no baseline shouldn't block)", body["ok"])
	}
	warnings, _ := body["warnings"].([]any)
	if len(warnings) == 0 {
		t.Fatalf("expected warning when no baseline, got %+v", body)
	}
}
