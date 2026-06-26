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

	var endpoint models.APIEndpoint
	if err := db.First(&endpoint, "project_id = ?", project.ID).Error; err != nil {
		t.Fatalf("find endpoint: %v", err)
	}
	if endpoint.Path != "/orders" || endpoint.Method != "POST" || endpoint.Tag != "orders" || endpoint.Summary != "Create order" {
		t.Fatalf("unexpected endpoint: %+v", endpoint)
	}
	if endpoint.Version != "Order API" {
		t.Fatalf("Version = %q, want Order API", endpoint.Version)
	}
}
