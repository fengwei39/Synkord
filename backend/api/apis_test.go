package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/synkord/core/database"
	"github.com/synkord/core/models"
	"github.com/synkord/core/services"
)

func newAPITestEngine(t *testing.T, userName string) (*gin.Engine, *services.TeamWithRole, *models.Project) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db := testDB(t)
	database.DB = db

	user := &models.User{Username: userName, HashedPassword: "x", Role: models.RoleAdmin, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	team, err := services.CreateTeam(db, user.ID, "API Test Team "+userName, "")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	project := &models.Project{TeamID: team.ID, Name: "svc-" + userName, ProjectType: models.ProjectBackend}
	if err := db.Create(project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	r := gin.New()
	r.Use(fakeAuth(user.ID))
	RegisterTeamAPIRoutes(r.Group(""))
	return r, team, project
}

func TestImportAPISpecFromProjectSwaggerURL(t *testing.T) {
	swaggerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
		  "openapi": "3.0.0",
		  "info": { "title": "Project API", "version": "2.1.0" },
		  "paths": {
		    "/users": {
		      "get": {
		        "summary": "List users",
		        "responses": { "200": { "description": "OK" } }
		      }
		    }
		  }
		}`))
	}))
	defer swaggerServer.Close()

	r, team, project := newAPITestEngine(t, "u-api-import-project")
	if err := database.DB.Model(project).Update("swagger_url", swaggerServer.URL).Error; err != nil {
		t.Fatalf("update swagger_url: %v", err)
	}

	w, body := doRequest(r, "POST", "/teams/"+team.ID+"/projects/"+project.ID+"/apis/import-from-project", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if body["api_count"] != float64(1) {
		t.Fatalf("api_count = %v, want 1", body["api_count"])
	}
	if body["spec_version"] != "2.1.0" {
		t.Fatalf("spec_version = %v, want 2.1.0", body["spec_version"])
	}

	var refreshed models.Project
	if err := database.DB.First(&refreshed, "id = ?", project.ID).Error; err != nil {
		t.Fatalf("load project: %v", err)
	}
	if refreshed.OpenAPIVersion != "2.1.0" {
		t.Fatalf("project openapi_version = %q, want 2.1.0", refreshed.OpenAPIVersion)
	}
	if refreshed.OpenAPISpec == "" {
		t.Fatalf("project openapi_spec should be saved")
	}
}
