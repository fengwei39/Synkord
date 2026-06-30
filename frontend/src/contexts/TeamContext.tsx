import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTeam as createTeamRequest, listTeams } from '../api/teams';
import { useAuth } from '../api/auth';
import type { Team } from '../types/team';

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  currentTeamId: string | null;
  loading: boolean;
  refreshTeams: () => Promise<void>;
  switchTeam: (teamId: string) => void;
  createTeam: (values: { name: string; description?: string }) => Promise<Team>;
}

const TeamContext = createContext<TeamContextType>({
  teams: [],
  currentTeam: null,
  currentTeamId: null,
  loading: false,
  refreshTeams: async () => {},
  switchTeam: () => {},
  createTeam: async () => {
    throw new Error('TeamProvider is not mounted');
  },
});

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectTeam = useCallback((teamId: string | null) => {
    setCurrentTeamId(teamId);
  }, []);

  const refreshTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      selectTeam(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await listTeams();
      setTeams(items);
      setCurrentTeamId((current) => items.find((item) => item.id === current)?.id || items[0]?.id || null);
    } finally {
      setLoading(false);
    }
  }, [selectTeam, user]);

  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  const createTeam = useCallback(async (values: { name: string; description?: string }) => {
    const team = await createTeamRequest(values);
    setTeams((items) => [team, ...items.filter((item) => item.id !== team.id)]);
    selectTeam(team.id);
    return team;
  }, [selectTeam]);

  const currentTeam = useMemo(
    () => teams.find((team) => team.id === currentTeamId) || null,
    [currentTeamId, teams],
  );

  return (
    <TeamContext.Provider
      value={{
        teams,
        currentTeam,
        currentTeamId,
        loading,
        refreshTeams,
        switchTeam: selectTeam,
        createTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
