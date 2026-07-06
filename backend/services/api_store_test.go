// Synkord api_store 单元测试（v1.2 重写：基于 ContractSet/ContractMember）
package services

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	// 每个测试使用独立的 in-memory db，避免共享 cache 导致 UNIQUE 冲突
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.ContractSet{},
		&models.ContractMember{},
		&models.SwaggerSpec{},
		&models.APIEndpoint{},
		&models.DataModel{},
		&models.DataModelVersion{},
		&models.Dependency{},
		&models.MCPAuditLog{},
		&models.ActiveContract{},
	); err != nil {
		t.Fatalf("migrate db: %v", err)
	}
	return db
}

// createOwnerContract 创建 owner + 契约集，返回 contract
// 用户名带测试名后缀，避免 cross-test UNIQUE 冲突
func createOwnerContract(t *testing.T, db *gorm.DB, name string) (*models.User, *models.ContractSet) {
	t.Helper()
	username := "u_" + sanitizeName(t.Name())
	user := &models.User{Username: username, HashedPassword: "x", Role: models.RoleEditor, IsActive: true}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	c, err := CreateContract(db, user.ID, name, "test")
	if err != nil {
		t.Fatalf("create contract: %v", err)
	}
	return user, c
}

func TestImportOpenAPISpecCreatesAPIsAndDependencies(t *testing.T) {
	db := testDB(t)
	_, contract := createOwnerContract(t, db, "user-service")

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

	result, err := ImportOpenAPISpec(db, contract.ID, spec)
	if err != nil {
		t.Fatalf("import spec: %v", err)
	}
	if result.APICount != 1 {
		t.Fatalf("APICount = %d, want 1", result.APICount)
	}
	if result.DepCount != 1 {
		t.Fatalf("DepCount = %d, want 1", result.DepCount)
	}
	if len(result.APIs) != 1 {
		t.Fatalf("APIs len = %d, want 1", len(result.APIs))
	}
	if result.APIs[0].Path != "/users/{id}" {
		t.Fatalf("path = %s, want /users/{id}", result.APIs[0].Path)
	}
}

func TestImportOpenAPISpecPostman(t *testing.T) {
	db := testDB(t)
	_, contract := createOwnerContract(t, db, "postman-import-service")

	spec := `{
	  "openapi": "3.0.0",
	  "info": { "title": "T", "version": "1.0.0" },
	  "paths": {
	    "/orders": {
	      "post": {
	        "summary": "Create Order",
	        "requestBody": {
	          "content": {
	            "application/json": {
	              "schema": { "$ref": "#/components/schemas/OrderDTO" }
	            }
	          }
	        },
	        "responses": { "201": { "description": "Created" } }
	      }
	    }
	  },
	  "components": { "schemas": { "OrderDTO": { "type": "object" } } }
	}`

	result, err := ImportOpenAPISpec(db, contract.ID, spec)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if result.APICount != 1 || result.DepCount != 1 {
		t.Fatalf("got apis=%d deps=%d, want 1/1", result.APICount, result.DepCount)
	}
}

func TestImportOpenAPISpecVersioned(t *testing.T) {
	db := testDB(t)
	_, contract := createOwnerContract(t, db, "user-service-versioned")

	specV1 := `{
	  "openapi": "3.0.3",
	  "info": { "title": "V", "version": "1.0.0" },
	  "paths": { "/health": { "get": { "summary": "Health", "responses": { "200": { "description": "ok" } } } } }
	}`
	specNoVer := `{
	  "openapi": "3.0.3",
	  "info": { "title": "V" },
	  "paths": { "/health": { "get": { "summary": "Health", "responses": { "200": { "description": "ok" } } } } }
	}`

	if _, err := ImportOpenAPISpec(db, contract.ID, specV1); err != nil {
		t.Fatalf("first import: %v", err)
	}
	// 第二次不指定 version，应自动 bump patch 到 1.0.1
	result, err := ImportOpenAPISpec(db, contract.ID, specNoVer)
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	if result.SpecVersion != "1.0.1" {
		t.Fatalf("version = %s, want 1.0.1", result.SpecVersion)
	}
}

func TestListContractAPIsFiltersCorrectly(t *testing.T) {
	db := testDB(t)
	_, contract := createOwnerContract(t, db, "filter-test")

	spec := `{
	  "openapi": "3.0.0",
	  "paths": {
	    "/a": { "get": { "summary": "Get A", "responses": {} } },
	    "/b": { "post": { "summary": "Post B", "responses": {} } },
	    "/c": { "delete": { "summary": "Delete C", "deprecated": true, "responses": {} } }
	  }
	}`
	if _, err := ImportOpenAPISpec(db, contract.ID, spec); err != nil {
		t.Fatalf("import: %v", err)
	}

	// 全部
	all, total, err := ListContractAPIs(db, contract.ID, "", "", "", true, 0, 100)
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if total != 3 || len(all) != 3 {
		t.Fatalf("all total=%d len=%d, want 3/3", total, len(all))
	}

	// 只看 GET
	gets, total2, err := ListContractAPIs(db, contract.ID, "", "GET", "", true, 0, 100)
	if err != nil {
		t.Fatalf("list get: %v", err)
	}
	if total2 != 1 || len(gets) != 1 || gets[0].Method != "GET" {
		t.Fatalf("gets total=%d, want 1", total2)
	}

	// 排除 deprecated
	_, total3, err := ListContractAPIs(db, contract.ID, "", "", "", false, 0, 100)
	if err != nil {
		t.Fatalf("list active: %v", err)
	}
	if total3 != 2 {
		t.Fatalf("active total=%d, want 2", total3)
	}

	// 关键字
	_, total4, err := ListContractAPIs(db, contract.ID, "delete", "", "", true, 0, 100)
	if err != nil {
		t.Fatalf("list kw: %v", err)
	}
	if total4 < 1 {
		t.Fatalf("keyword filter total=%d, want >=1", total4)
	}
}
