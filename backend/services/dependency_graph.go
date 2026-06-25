package services

import (
	"github.com/synkord/core/models"
	"gorm.io/gorm"
)

func CreateDependency(db *gorm.DB, sourceProjectID, targetProjectID, entityName, apiPath, apiMethod, dependencyType, source string, lockedVersion *string) (*models.Dependency, error) {
	if dependencyType == "" {
		dependencyType = "entity"
	}
	if source == "" {
		source = "manual"
	}
	d := &models.Dependency{
		SourceProjectID: sourceProjectID,
		TargetProjectID: targetProjectID,
		EntityName:      entityName,
		APIPath:         apiPath,
		APIMethod:       apiMethod,
		DependencyType:  dependencyType,
		Source:          source,
		LockedVersion:   lockedVersion,
	}
	if err := db.Create(d).Error; err != nil {
		return nil, err
	}
	return d, nil
}

func GetEntityDependencies(db *gorm.DB, entityName string) ([]models.Dependency, error) {
	var deps []models.Dependency
	if err := db.Preload("SourceProject").Preload("TargetProject").
		Where("entity_name = ?", entityName).Find(&deps).Error; err != nil {
		return nil, err
	}
	return deps, nil
}

func GetAPIDependencies(db *gorm.DB, apiPath, apiMethod string) ([]models.Dependency, error) {
	var deps []models.Dependency
	query := db.Preload("SourceProject").Preload("TargetProject").Where("api_path = ?", apiPath)
	if apiMethod != "" {
		query = query.Where("api_method = ?", apiMethod)
	}
	if err := query.Find(&deps).Error; err != nil {
		return nil, err
	}
	return deps, nil
}

type ProjectDeps struct {
	Outgoing []models.Dependency `json:"outgoing"`
	Incoming []models.Dependency `json:"incoming"`
}

func GetProjectDependencies(db *gorm.DB, projectID string) (*ProjectDeps, error) {
	var outgoing, incoming []models.Dependency

	if err := db.Preload("TargetProject").
		Where("source_project_id = ?", projectID).Find(&outgoing).Error; err != nil {
		return nil, err
	}
	if err := db.Preload("SourceProject").
		Where("target_project_id = ?", projectID).Find(&incoming).Error; err != nil {
		return nil, err
	}

	return &ProjectDeps{Outgoing: outgoing, Incoming: incoming}, nil
}

type GraphNode struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ProjectType string `json:"project_type"`
}

type GraphEdge struct {
	Source     string `json:"source"`
	Target     string `json:"target"`
	EntityName string `json:"entity_name"`
}

type DependencyGraph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

func GetFullDependencyGraph(db *gorm.DB) (*DependencyGraph, error) {
	var projects []models.Project
	if err := db.Find(&projects).Error; err != nil {
		return nil, err
	}

	nodes := make([]GraphNode, len(projects))
	for i, p := range projects {
		nodes[i] = GraphNode{ID: p.ID, Name: p.Name, ProjectType: string(p.ProjectType)}
	}

	var deps []models.Dependency
	if err := db.Find(&deps).Error; err != nil {
		return nil, err
	}

	edges := make([]GraphEdge, len(deps))
	for i, d := range deps {
		edges[i] = GraphEdge{Source: d.SourceProjectID, Target: d.TargetProjectID, EntityName: d.EntityName}
	}

	return &DependencyGraph{Nodes: nodes, Edges: edges}, nil
}

func FindAffectedProjects(db *gorm.DB, projectID string) ([]string, error) {
	var deps []models.Dependency
	if err := db.Where("target_project_id = ?", projectID).Find(&deps).Error; err != nil {
		return nil, err
	}
	affected := make([]string, 0, len(deps))
	seen := make(map[string]bool)
	for _, d := range deps {
		if !seen[d.SourceProjectID] {
			affected = append(affected, d.SourceProjectID)
			seen[d.SourceProjectID] = true
		}
	}
	return affected, nil
}

func DeleteDependency(db *gorm.DB, depID string) error {
	return db.Delete(&models.Dependency{}, "id = ?", depID).Error
}
