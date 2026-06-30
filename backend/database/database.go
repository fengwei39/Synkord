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
		{table: "api_endpoints", columns: []string{"team_id"}},
		{table: "dependencies", columns: []string{"team_id"}},
		{table: "mcp_configs", columns: []string{"project_id", "token_hash"}},
		{table: "mcp_audit_logs", columns: []string{"project_id"}},
	}

	for _, check := range checks {
		if !db.Migrator().HasTable(check.table) {
			continue
		}
		for _, column := range check.columns {
			if !db.Migrator().HasColumn(check.table, column) {
				if err := db.Migrator().DropTable(check.table); err != nil {
					return err
				}
				break
			}
		}
	}

	for _, table := range []string{"team_mcp_settings", "global_mcp_server_configs", "change_sets", "notifications", "webhook_configs"} {
		if db.Migrator().HasTable(table) {
			if err := db.Migrator().DropTable(table); err != nil {
				return err
			}
		}
	}

	if db.Migrator().HasTable("entities") && db.Migrator().HasColumn("entities", "is_global") {
		if db.Migrator().HasTable("entity_versions") {
			if err := db.Migrator().DropTable("entity_versions"); err != nil {
				return err
			}
		}
		if err := db.Migrator().DropTable("entities"); err != nil {
			return err
		}
	}

	return nil
}
