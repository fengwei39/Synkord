package services

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

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
		&models.DataModel{},
		&models.DataModelVersion{},
		&models.Dependency{},
		&models.MCPConfig{},
		&models.MCPAuditLog{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return db
}

func TestImportOpenAPISpecCreatesAPIsAndDependencies(t *testing.T) {
	db := testDB(t)
	project := models.Project{Name: "user-service", ProjectType: models.ProjectBackend}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	spec := `{
	  "openapi": "3.0.3",
	  "paths": {
	    "/users/{id}": {
	      "get": {
	        "tags": ["users"],
	        "summary": "Get user",
	        "responses": {
	          "200": {
	            "description": "OK",
	            "content": {
	              "application/json": {
	                "schema": { "$ref": "#/components/schemas/UserDTO" }
	              }
	            }
	          }
	        }
	      }
	    }
	  },
	  "components": {
	    "schemas": {
	      "UserDTO": {
	        "type": "object",
	        "properties": { "id": { "type": "string" } }
	      }
	    }
	  }
	}`

	result, err := ImportOpenAPISpec(db, project.ID, spec)
	if err != nil {
		t.Fatalf("import spec: %v", err)
	}
	if result.APICount != 1 {
		t.Fatalf("APICount = %d, want 1", result.APICount)
	}
	if result.DepCount != 1 {
		t.Fatalf("DepCount = %d, want 1", result.DepCount)
	}

	var dep models.Dependency
	if err := db.First(&dep, "source_project_id = ?", project.ID).Error; err != nil {
		t.Fatalf("find dependency: %v", err)
	}
	if dep.EntityName != "UserDTO" || dep.APIPath != "/users/{id}" || dep.APIMethod != "GET" || dep.Source != "openapi" {
		t.Fatalf("unexpected dependency: %+v", dep)
	}
}

func TestImportPostmanCollectionCreatesAPIs(t *testing.T) {
	db := testDB(t)
	project := models.Project{Name: "postman-import-service", ProjectType: models.ProjectBackend}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	collection := `{
	  "info": { "name": "Order API" },
	  "item": [
	    {
	      "name": "orders",
	      "item": [
	        {
	          "name": "Create order",
	          "request": {
	            "method": "POST",
	            "url": "https://api.example.com/orders?debug=true",
	            "description": "Create an order",
	            "body": { "mode": "raw", "raw": "{\"id\":\"1\"}" }
	          }
	        }
	      ]
	    }
	  ]
	}`

	result, err := ImportPostmanCollection(db, project.ID, collection)
	if err != nil {
		t.Fatalf("import postman collection: %v", err)
	}
	if result.APICount != 1 {
		t.Fatalf("APICount = %d, want 1", result.APICount)
	}
	if result.SpecID == "" {
		t.Fatalf("SpecID should be set on first import")
	}
	if result.SpecName != "Order API" {
		t.Fatalf("SpecName = %q, want Order API", result.SpecName)
	}
	if result.SpecVersion != "1.0.0" {
		t.Fatalf("SpecVersion = %q, want 1.0.0 (first import)", result.SpecVersion)
	}

	var spec models.SwaggerSpec
	if err := db.First(&spec, "id = ?", result.SpecID).Error; err != nil {
		t.Fatalf("find swagger spec: %v", err)
	}
	if spec.Source != models.SpecSourcePostman {
		t.Fatalf("Source = %q, want postman", spec.Source)
	}
	if spec.APICount != 1 {
		t.Fatalf("spec.APICount = %d, want 1", spec.APICount)
	}

	var endpoint models.APIEndpoint
	if err := db.First(&endpoint, "project_id = ?", project.ID).Error; err != nil {
		t.Fatalf("find endpoint: %v", err)
	}
	if endpoint.Path != "/orders" || endpoint.Method != "POST" || endpoint.Tag != "orders" || endpoint.Summary != "Create order" {
		t.Fatalf("unexpected endpoint: %+v", endpoint)
	}
	if endpoint.SpecID != result.SpecID {
		t.Fatalf("endpoint.SpecID = %q, want %q", endpoint.SpecID, result.SpecID)
	}
	if endpoint.Version != "1.0.0" {
		t.Fatalf("endpoint.Version = %q, want 1.0.0", endpoint.Version)
	}
}

func TestImportOpenAPISpecAutoIncrementsVersion(t *testing.T) {
	db := testDB(t)
	project := models.Project{Name: "user-service-versioned", ProjectType: models.ProjectBackend}
	if err := db.Create(&project).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}

	spec1 := `{
	  "openapi": "3.0.3",
	  "info": { "title": "User API" },
	  "paths": {
	    "/users": { "get": { "summary": "List users", "responses": { "200": { "description": "OK" } } } }
	  }
	}`
	first, err := ImportOpenAPISpec(db, project.ID, spec1)
	if err != nil {
		t.Fatalf("first import: %v", err)
	}
	if first.SpecVersion != "1.0.0" {
		t.Fatalf("first.SpecVersion = %q, want 1.0.0", first.SpecVersion)
	}
	if first.SpecName != "User API" {
		t.Fatalf("first.SpecName = %q, want User API", first.SpecName)
	}

	// 第二次导入同名 spec → patch 自增
	spec2 := `{
	  "openapi": "3.0.3",
	  "info": { "title": "User API" },
	  "paths": {
	    "/users": { "get": { "summary": "List users v2", "responses": { "200": { "description": "OK" } } } },
	    "/orders": { "get": { "summary": "List orders", "responses": { "200": { "description": "OK" } } } }
	  }
	}`
	second, err := ImportOpenAPISpec(db, project.ID, spec2)
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if second.SpecVersion != "1.0.1" {
		t.Fatalf("second.SpecVersion = %q, want 1.0.1 (auto patch bump)", second.SpecVersion)
	}
	if second.SpecID == first.SpecID {
		t.Fatalf("second.SpecID should differ from first")
	}

	// 校验 spec 历史保留，旧 endpoints 仍可查
	var specCount int64
	if err := db.Model(&models.SwaggerSpec{}).Where("project_id = ?", project.ID).Count(&specCount).Error; err != nil {
		t.Fatalf("count specs: %v", err)
	}
	if specCount != 2 {
		t.Fatalf("spec count = %d, want 2 (history preserved)", specCount)
	}

	// 校验当前 endpoints 来自最新 spec
	var endpoints []models.APIEndpoint
	if err := db.Where("project_id = ?", project.ID).Find(&endpoints).Error; err != nil {
		t.Fatalf("find endpoints: %v", err)
	}
	if len(endpoints) != 2 {
		t.Fatalf("endpoint count = %d, want 2 (replaced by latest import)", len(endpoints))
	}
	for _, e := range endpoints {
		if e.SpecID != second.SpecID {
			t.Fatalf("endpoint %s still linked to old spec", e.Path)
		}
	}

	// 第三次导入显式带 version hint → 直接使用
	spec3 := `{
	  "openapi": "3.0.3",
	  "info": { "title": "User API", "version": "2.0.0" },
	  "paths": {
	    "/users": { "get": { "summary": "List users v3", "responses": { "200": { "description": "OK" } } } }
	  }
	}`
	third, err := ImportOpenAPISpec(db, project.ID, spec3)
	if err != nil {
		t.Fatalf("third import: %v", err)
	}
	if third.SpecVersion != "2.0.0" {
		t.Fatalf("third.SpecVersion = %q, want 2.0.0 (explicit hint)", third.SpecVersion)
	}
}
