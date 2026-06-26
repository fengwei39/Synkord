export type TeamRole = 'team_admin' | 'editor' | 'viewer';

export interface Team {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  role: TeamRole;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  username: string;
  email?: string;
  role: TeamRole;
  status: 'active' | 'disabled';
  invite_status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  remark?: string;
  joined_at: string;
  last_active_at?: string;
}
