package database

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"github.com/synkord/core/config"
	"github.com/synkord/core/models"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(cfg *config.Config) error {
	dbPath, err := filepath.Abs(cfg.DBPath)
	if err != nil {
		return err
	}
	cfg.DBPath = dbPath

	dir := filepath.Dir(cfg.DBPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	if err := ensureSQLiteFile(cfg.DBPath); err != nil {
		return err
	}

	DB, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	if err != nil {
		return err
	}

	if err := resetIncompatibleSQLiteTables(DB); err != nil {
		if resetErr := recreateSQLiteDatabase(cfg); resetErr != nil {
			return resetErr
		}
	}

	if err := autoMigrate(DB); err != nil {
		if resetErr := recreateSQLiteDatabase(cfg); resetErr != nil {
			return resetErr
		}
		return autoMigrate(DB)
	}
	return nil
}

func autoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
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
	)
}

func recreateSQLiteDatabase(cfg *config.Config) error {
	if DB != nil {
		if sqlDB, err := DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		path := cfg.DBPath + suffix
		_ = os.Chmod(path, 0666)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			if !strings.Contains(strings.ToLower(err.Error()), "cannot find") {
				return err
			}
		}
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0755); err != nil {
		return err
	}
	if err := ensureSQLiteFile(cfg.DBPath); err != nil {
		return err
	}
	var err error
	DB, err = gorm.Open(sqlite.Open(cfg.DBPath), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Warn),
	})
	return err
}

func ensureSQLiteFile(path string) error {
	file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0666)
	if err != nil {
		return err
	}
	return file.Close()
}

func resetIncompatibleSQLiteTables(db *gorm.DB) error {
	checks := []struct {
		table   string
		columns []string
	}{
		{table: "api_endpoints", columns: []string{"team_id", "project_id"}},
		{table: "dependencies", columns: []string{"team_id", "source_project_id", "target_project_id"}},
		{table: "mcp_audit_logs", columns: []string{"team_id", "project_id"}},
		{table: "swagger_specs", columns: []string{"team_id", "project_id"}},
		{table: "entities", columns: []string{"team_id", "project_id"}},
	}

	for _, check := range checks {
		if !db.Migrator().HasTable(check.table) {
			continue
		}
		for _, column := range check.columns {
			if db.Migrator().HasColumn(check.table, column) {
				if err := db.Migrator().DropTable(check.table); err != nil {
					return err
				}
				break
			}
		}
	}

	for _, table := range []string{
		"teams",
		"team_members",
		"projects",
		"team_mcp_settings",
		"global_mcp_server_configs",
		"change_sets",
		"notifications",
		"webhook_configs",
	} {
		if db.Migrator().HasTable(table) {
			if err := db.Migrator().DropTable(table); err != nil {
				return err
			}
		}
	}

	// 清理已废弃的 contract_sets.project_type 列（Phase X：移除项目类型后）
	// 注：不能用 gorm.Migrator.DropColumn，因为 ProjectType 已从 struct 中移除，
	//     gorm 会尝试从 struct 反射查字段，找不到就 nil pointer。
	//     改用原始 PRAGMA + ALTER TABLE。
	if hasColumn(db, "contract_sets", "project_type") {
		if err := db.Exec(`ALTER TABLE contract_sets DROP COLUMN project_type`).Error; err != nil {
			return err
		}
	}

	return nil
}

// hasColumn 用 PRAGMA table_info 探测列是否存在（不依赖 struct，避免 ProjectType 已被删除时的反射失败）
func hasColumn(db *gorm.DB, table, column string) bool {
	if !db.Migrator().HasTable(table) {
		return false
	}
	type colInfo struct {
		Name string
	}
	var cols []colInfo
	if err := db.Raw(`PRAGMA table_info(`+table+`)`).Scan(&cols).Error; err != nil {
		return false
	}
	for _, c := range cols {
		if c.Name == column {
			return true
		}
	}
	return false
}
