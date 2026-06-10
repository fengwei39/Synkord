package notify

import "synkord/server/internal/contracts"

// ContractsNotifier adapts notify.Service to contracts.Notifier interface.
type ContractsNotifier struct {
	svc *Service
}

func NewContractsNotifier(svc *Service) *ContractsNotifier {
	return &ContractsNotifier{svc: svc}
}

// OnPublish converts a contracts.PublishEvent to notify.PublishEvent and dispatches it.
func (n *ContractsNotifier) OnPublish(ev contracts.PublishEvent) {
	n.svc.OnPublish(PublishEvent{
		OrgID:       ev.OrgID,
		PackName:    ev.PackName,
		OldVersion:  ev.OldVersion,
		NewVersion:  ev.NewVersion,
		DiffSummary: ev.DiffSummary,
	})
}
