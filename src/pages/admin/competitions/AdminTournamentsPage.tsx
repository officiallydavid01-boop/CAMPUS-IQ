

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarClock,
  Plus,
  RefreshCw,
  Swords,
} from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

import {
  advanceGroupStageToKnockout,
  advanceTeamGroupStageToKnockout,
  createTournamentDraft,
  finalizeTournamentStandings,
  generateTournamentMatches,
  listAdminTeamCompetitions,
  listAdminTournamentMatches,
  listAdminTournaments,
  listPublishedQuestions,
  publishTournament,
  recordTournamentMatchResult,
  transitionTournamentStatus,
  type CompetitionScopeOptions,
  type PublishedQuestion,
  type Tournament,
} from "@/services/competitions/competitionService";

// IMPORTANT:
// This page expects listCompetitionScopeOptions to be exported
// from competitionService.ts. If it is not exported there, this
// import must be resolved against the actual service implementation.
import { listCompetitionScopeOptions } from "@/services/competitions/competitionService";

function localDateTime(date: Date) {
  return new Date(
    date.getTime() - date.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
}

function futureTime(hours: number) {
  return localDateTime(
    new Date(Date.now() + hours * 3600000),
  );
}

const formats = [
  {
    value: "single_elimination",
    label: "Single elimination",
  },
  {
    value: "round_robin",
    label: "Round-robin",
  },
  {
    value: "group_stage_knockout",
    label: "Group stage + knockout",
  },
];

const field: CSSProperties = {
  width: "100%",
  padding: "var(--space-3)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-glass)",
  color: "var(--text-primary)",
  font: "inherit",
};

type ScopeType =
  | "everyone"
  | "institution"
  | "faculty"
  | "department"
  | "programme"
  | "level";

type TournamentRound = {
  id: string;
  round_number: number;
  title: string | null;
  tournament_matches: Array<Record<string, unknown>>;
};

type MatchScore = {
  a: string;
  b: string;
  reason: string;
};

export function AdminTournamentsPage() {
  const { showToast } = useToast();

  const [items, setItems] = useState<Tournament[]>([]);
  const [teamCompetitions, setTeamCompetitions] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [teamCompetitionId, setTeamCompetitionId] = useState("");
  const [scopeOptions, setScopeOptions] =
    useState<CompetitionScopeOptions>(
      {} as CompetitionScopeOptions,
    );
  const [scopeType, setScopeType] =
    useState<ScopeType>("everyone");
  const [scopeId, setScopeId] = useState("");

  const [questions, setQuestions] = useState<
    PublishedQuestion[]
  >([]);
  const [selected, setSelected] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState(
    "single_elimination",
  );
  const [participantMode, setParticipantMode] =
    useState<"individual" | "team">("individual");
  const [teamTopN, setTeamTopN] = useState(3);

  const [regStart, setRegStart] = useState(
    futureTime(1),
  );
  const [regEnd, setRegEnd] = useState(futureTime(24));
  const [start, setStart] = useState(futureTime(25));
  const [end, setEnd] = useState(futureTime(28));

  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
  );
  const [rounds, setRounds] = useState(6);
  const [matchDuration, setMatchDuration] = useState(30);
  const [limit, setLimit] = useState(64);

  const refresh = useCallback(async () => {
    const [tournaments, publishedQuestions, scopes, teams] =
      await Promise.all([
        listAdminTournaments(),
        listPublishedQuestions(),
        listCompetitionScopeOptions(),
        listAdminTeamCompetitions(),
      ]);

    setItems(tournaments);
    setQuestions(publishedQuestions);
    setScopeOptions(scopes);
    setTeamCompetitions(teams);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((error: unknown) => {
        showToast(
          error instanceof Error
            ? error.message
            : "Couldn't load tournaments.",
          "error",
        );
      })
      .finally(() => setLoading(false));
  }, [refresh, showToast]);

  async function action(
    id: string,
    fn: () => Promise<unknown>,
    message: string,
  ) {
    setBusy(id);

    try {
      await fn();
      await refresh();
      showToast(message, "success");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Tournament action failed.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }

  async function create() {
    setBusy("create");

    try {
      await createTournamentDraft({
        title,
        description,
        format,
        participantMode,
        teamTopN,
        teamCompetitionId:
          participantMode === "team"
            ? teamCompetitionId
            : null,
        startsAt: start,
        endsAt: end,
        registrationStartsAt: regStart,
        registrationEndsAt: regEnd,
        timezone,
        questionIds: selected,
        roundCount: rounds,
        matchDurationMinutes: matchDuration,
        participantLimit: limit > 0 ? limit : null,
        scopeType,
        scopeId: scopeType === "everyone" ? null : scopeId,
      });

      await refresh();
      setShowCreate(false);
      setTitle("");
      setSelected([]);

      showToast("Tournament draft created.", "success");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Couldn't create tournament.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div
        className="container"
        style={{ paddingBlock: "var(--space-8)" }}
      >
        <SkeletonText lines={5} />
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{
        paddingBlock: "var(--space-8)",
        display: "grid",
        gap: "var(--space-5)",
      }}
    >
      <header
        className="cluster"
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <Badge tone="accent">ADMIN · PHASE 7</Badge>
          <h1
            style={{
              fontSize: "var(--text-2xl)",
              marginBlock: "var(--space-2)",
            }}
          >
            Tournament management
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Publish a format, open scheduled registration, then
            generate matches from verified registrations.
          </p>
        </div>

        <div className="cluster">
          <Button
            variant="secondary"
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>

          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus size={16} />
            New tournament
          </Button>
        </div>
      </header>

      {showCreate && (
        <GlassCard>
          <h2
            style={{
              fontSize: "var(--text-xl)",
              marginTop: 0,
            }}
          >
            Tournament draft
          </h2>

          <div
            className="grid-auto-fit"
            style={{ gap: "var(--space-3)" }}
          >
            <label className="stack" style={{ gap: 4 }}>
              Title
              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={120}
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Participant mode
              <select
                value={participantMode}
                onChange={(event) =>
                  setParticipantMode(
                    event.target.value as
                      | "individual"
                      | "team",
                  )
                }
                style={field}
              >
                <option value="individual">
                  Individual students
                </option>
                <option value="team">Registered teams</option>
              </select>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Linked team competition
              <select
                value={teamCompetitionId}
                onChange={(event) =>
                  setTeamCompetitionId(event.target.value)
                }
                disabled={participantMode !== "team"}
                style={field}
              >
                <option value="">
                  Choose team competition
                </option>
                {teamCompetitions.map((competition) => (
                  <option
                    key={competition.id}
                    value={competition.id}
                  >
                    {competition.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Top scores per team
              <input
                type="number"
                min={1}
                max={20}
                value={teamTopN}
                onChange={(event) =>
                  setTeamTopN(Number(event.target.value))
                }
                disabled={participantMode !== "team"}
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Format
              <select
                value={format}
                onChange={(event) => {
                  const nextFormat = event.target.value;
                  setFormat(nextFormat);
                  setRounds(
                    nextFormat === "round_robin"
                      ? 1
                      : nextFormat === "group_stage_knockout"
                        ? 4
                        : 6,
                  );
                }}
                style={field}
              >
                {formats.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Eligibility scope
              <select
                value={scopeType}
                onChange={(event) => {
                  setScopeType(
                    event.target.value as ScopeType,
                  );
                  setScopeId("");
                }}
                style={field}
              >
                <option value="everyone">Everyone</option>
                <option value="institution">Institution</option>
                <option value="faculty">Faculty</option>
                <option value="department">Department</option>
                <option value="programme">Programme</option>
                <option value="level">Level</option>
              </select>
            </label>

            {scopeType !== "everyone" && (
              <label className="stack" style={{ gap: 4 }}>
                Eligible record
                <select
                  value={scopeId}
                  onChange={(event) =>
                    setScopeId(event.target.value)
                  }
                  style={field}
                >
                  <option value="">
                    Choose {scopeType}
                  </option>
                  {(
                    scopeOptions[
                      scopeType as Exclude<
                        ScopeType,
                        "everyone"
                      >
                    ] ?? []
                  ).map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="stack" style={{ gap: 4 }}>
              Registration opens
              <input
                type="datetime-local"
                value={regStart}
                onChange={(event) =>
                  setRegStart(event.target.value)
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Registration closes
              <input
                type="datetime-local"
                value={regEnd}
                onChange={(event) =>
                  setRegEnd(event.target.value)
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Tournament starts
              <input
                type="datetime-local"
                value={start}
                onChange={(event) =>
                  setStart(event.target.value)
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Tournament ends
              <input
                type="datetime-local"
                value={end}
                onChange={(event) =>
                  setEnd(event.target.value)
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Round count
              <input
                type="number"
                min={1}
                max={20}
                value={rounds}
                onChange={(event) =>
                  setRounds(Number(event.target.value))
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Match duration (min)
              <input
                type="number"
                min={1}
                value={matchDuration}
                onChange={(event) =>
                  setMatchDuration(Number(event.target.value))
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Participant limit (0 = unlimited)
              <input
                type="number"
                min={0}
                value={limit}
                onChange={(event) =>
                  setLimit(Number(event.target.value))
                }
                style={field}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              Timezone
              <input
                value={timezone}
                onChange={(event) =>
                  setTimezone(event.target.value)
                }
                style={field}
              />
            </label>
          </div>

          <div
            className="stack"
            style={{
              gap: "var(--space-2)",
              marginTop: "var(--space-3)",
            }}
          >
            <strong>
              Questions per match ({selected.length} selected)
            </strong>

            <div
              style={{
                maxHeight: 260,
                overflowY: "auto",
                border: "1px solid var(--border-glass)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-2)",
              }}
            >
              {questions.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  Publish questions in the question bank first.
                </p>
              ) : (
                questions.slice(0, 100).map((question) => (
                  <label
                    key={question.id}
                    className="cluster"
                    style={{
                      alignItems: "flex-start",
                      gap: "var(--space-2)",
                      padding: "var(--space-2)",
                      borderBottom:
                        "1px solid var(--border-glass)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(question.id)}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, question.id]
                            : previous.filter(
                                (id) => id !== question.id,
                              ),
                        )
                      }
                    />

                    <span style={{ fontSize: "var(--text-sm)" }}>
                      {question.prompt}
                      <small
                        style={{
                          display: "block",
                          color: "var(--text-muted)",
                        }}
                      >
                        {question.question_type}
                      </small>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <label
            className="stack"
            style={{
              gap: 4,
              marginTop: "var(--space-3)",
            }}
          >
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              style={field}
            />
          </label>

          <div
            className="cluster"
            style={{ marginTop: "var(--space-3)" }}
          >
            <Button
              onClick={() => void create()}
              isLoading={busy === "create"}
              disabled={
                !title.trim() ||
                selected.length === 0 ||
                (scopeType !== "everyone" && !scopeId) ||
                (participantMode === "team" &&
                  !teamCompetitionId)
              }
            >
              Save draft
            </Button>

            <Button
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
          </div>
        </GlassCard>
      )}

      {items.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={Swords}
            title="No tournaments yet"
            description="Create a draft to configure one of the three approved tournament formats."
          />
        </GlassCard>
      ) : (
        items.map((item) => (
          <GlassCard key={item.id}>
            <div
              className="cluster"
              style={{
                justifyContent: "space-between",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: "1 1 250px" }}>
                <Badge>{item.status}</Badge>

                <h2
                  style={{
                    fontSize: "var(--text-lg)",
                    marginBlock: "var(--space-2)",
                  }}
                >
                  {item.title}
                </h2>

                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  {formats.find(
                    (formatItem) =>
                      formatItem.value === item.format,
                  )?.label ?? item.format}
                  {" · "}
                  {item.participant_mode === "team"
                    ? "Team tournament"
                    : "Individual tournament"}
                  {" · "}
                  {item.round_count} rounds
                  {" · "}
                  {item.question_count} questions/match
                </p>

                <span
                  className="cluster"
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--text-muted)",
                  }}
                >
                  <CalendarClock size={14} />
                  {new Date(item.starts_at).toLocaleString()}
                </span>
              </div>

              <div
                className="cluster"
                style={{ flexWrap: "wrap" }}
              >
                {item.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      void action(
                        item.id,
                        () => publishTournament(item.id),
                        "Tournament published and rounds created.",
                      )
                    }
                    isLoading={busy === item.id}
                  >
                    Publish
                  </Button>
                )}

                {item.status !== "draft" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void action(
                        item.id,
                        () =>
                          generateTournamentMatches(
                            item.id,
                            item.participant_mode ?? "individual",
                          ),
                        item.participant_mode === "team"
                          ? "Team match schedule generated."
                          : "Match schedule generated.",
                      )
                    }
                    isLoading={busy === item.id}
                  >
                    Generate matches
                  </Button>
                )}
              </div>
            </div>

            <TournamentMatchManager tournament={item} />
          </GlassCard>
        ))
      )}
    </div>
  );
}

function TournamentMatchManager({
  tournament,
}: {
  tournament: Tournament;
}) {
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [outcomes, setOutcomes] = useState<
    Record<string, string>
  >({});
  const [scores, setScores] = useState<
    Record<string, MatchScore>
  >({});

  async function load() {
    setLoading(true);

    try {
      setRounds(
        (await listAdminTournamentMatches(
          tournament.id,
        )) as TournamentRound[],
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Couldn't load match schedule.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function run(
    key: string,
    fn: () => Promise<unknown>,
    message: string,
  ) {
    setBusy(key);

    try {
      await fn();
      await load();
      showToast(message, "success");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Tournament operation failed.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }

  function values(matchId: string): MatchScore {
    return (
      scores[matchId] ?? {
        a: "",
        b: "",
        reason: "Result reviewed by Admin",
      }
    );
  }

  return (
    <div
      style={{
        marginTop: "var(--space-4)",
        borderTop: "1px solid var(--border-glass)",
        paddingTop: "var(--space-3)",
      }}
    >
      <div
        className="cluster"
        style={{
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "var(--text-sm)" }}>
          Match operations
        </strong>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen((previous) => !previous);
            if (!open) void load();
          }}
        >
          {open ? "Hide schedule" : "Manage matches"}
        </Button>
      </div>

      {open && (
        <div
          className="stack"
          style={{
            gap: "var(--space-3)",
            marginTop: "var(--space-3)",
          }}
        >
          <div
            className="cluster"
            style={{ flexWrap: "wrap" }}
          >
            {tournament.status === "scheduled" && (
              <Button
                size="sm"
                onClick={() =>
                  void run(
                    "live",
                    () =>
                      transitionTournamentStatus(
                        tournament.id,
                        "live",
                      ),
                    "Tournament moved live.",
                  )
                }
                isLoading={busy === "live"}
              >
                Start tournament
              </Button>
            )}

            {tournament.status === "live" && (
              <Button
                size="sm"
                onClick={() =>
                  void run(
                    "complete",
                    () =>
                      transitionTournamentStatus(
                        tournament.id,
                        "completed",
                      ),
                    "Tournament completed.",
                  )
                }
                isLoading={busy === "complete"}
              >
                Complete tournament
              </Button>
            )}

            {tournament.status === "completed" && (
              <Button
                size="sm"
                onClick={() =>
                  void run(
                    "finalize",
                    () =>
                      finalizeTournamentStandings(
                        tournament.id,
                        tournament.participant_mode ??
                          "individual",
                      ),
                    "Final standings published and rewards issued idempotently.",
                  )
                }
                isLoading={busy === "finalize"}
              >
                Finalize standings
              </Button>
            )}

            {tournament.format ===
              "group_stage_knockout" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void run(
                    "advance",
                    () =>
                      tournament.participant_mode === "team"
                        ? advanceTeamGroupStageToKnockout(
                            tournament.id,
                          )
                        : advanceGroupStageToKnockout(
                            tournament.id,
                          ),
                    "Group qualifiers advanced into the knockout bracket.",
                  )
                }
                isLoading={busy === "advance"}
              >
                Advance group qualifiers
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => void load()}
              isLoading={loading}
            >
              Refresh matches
            </Button>
          </div>

          {loading ? (
            <SkeletonText lines={3} />
          ) : rounds.length === 0 ? (
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "var(--text-sm)",
              }}
            >
              No matches generated yet. Generate the schedule
              after registration closes.
            </p>
          ) : (
            rounds.map((round) => (
              <GlassCard
                key={round.id}
                padding="var(--space-3)"
              >
                <div
                  className="cluster"
                  style={{ justifyContent: "space-between" }}
                >
                  <strong>
                    Round {round.round_number}
                    {round.title
                      ? ` · ${round.title}`
                      : ""}
                  </strong>

                  <Badge>
                    {round.tournament_matches.length} matches
                  </Badge>
                </div>

                {round.tournament_matches.map((match) => {
                  const matchId = String(match.id);
                  const value = values(matchId);

                  const closed = [
                    "completed",
                    "walkover",
                    "cancelled",
                  ].includes(String(match.status));

                  return (
                    <div
                      key={matchId}
                      style={{
                        paddingBlock: "var(--space-3)",
                        borderBottom:
                          "1px solid var(--border-glass)",
                      }}
                    >
                      <div
                        className="cluster"
                        style={{
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--text-sm)",
                          }}
                        >
                          Match {matchId.slice(0, 8)}
                          {" · "}
                          {String(
                            match.participant_a_id ??
                              match.team_a_id ??
                              "TBD",
                          ).slice(0, 8)}
                          {" vs "}
                          {String(
                            match.participant_b_id ??
                              match.team_b_id ??
                              "TBD",
                          ).slice(0, 8)}
                        </span>

                        <Badge
                          tone={
                            closed ? "success" : "neutral"
                          }
                        >
                          {String(match.status)}
                        </Badge>
                      </div>

                      {!closed && (
                        <div
                          className="stack"
                          style={{
                            gap: "var(--space-2)",
                            marginTop: "var(--space-2)",
                          }}
                        >
                          <div
                            className="grid-auto-fit"
                            style={{ gap: "var(--space-2)" }}
                          >
                            <label
                              className="stack"
                              style={{
                                gap: 3,
                                fontSize: "var(--text-xs)",
                              }}
                            >
                              Score A
                              <input
                                type="number"
                                min={0}
                                value={value.a}
                                onChange={(event) =>
                                  setScores((previous) => ({
                                    ...previous,
                                    [matchId]: {
                                      ...value,
                                      a: event.target.value,
                                    },
                                  }))
                                }
                                style={field}
                              />
                            </label>

                            <label
                              className="stack"
                              style={{
                                gap: 3,
                                fontSize: "var(--text-xs)",
                              }}
                            >
                              Score B
                              <input
                                type="number"
                                min={0}
                                value={value.b}
                                onChange={(event) =>
                                  setScores((previous) => ({
                                    ...previous,
                                    [matchId]: {
                                      ...value,
                                      b: event.target.value,
                                    },
                                  }))
                                }
                                style={field}
                              />
                            </label>

                            <label
                              className="stack"
                              style={{
                                gap: 3,
                                fontSize: "var(--text-xs)",
                              }}
                            >
                              Outcome
                              <select
                                value={
                                  outcomes[matchId] ??
                                  "a_wins"
                                }
                                onChange={(event) =>
                                  setOutcomes((previous) => ({
                                    ...previous,
                                    [matchId]:
                                      event.target.value,
                                  }))
                                }
                                style={field}
                              >
                                <option value="a_wins">
                                  A wins
                                </option>
                                <option value="b_wins">
                                  B wins
                                </option>
                                <option value="draw">Draw</option>
                                <option value="forfeit_a">
                                  A forfeits
                                </option>
                                <option value="forfeit_b">
                                  B forfeits
                                </option>
                                <option value="double_forfeit">
                                  Double forfeit
                                </option>
                              </select>
                            </label>
                          </div>

                          <label
                            className="stack"
                            style={{
                              gap: 3,
                              fontSize: "var(--text-xs)",
                            }}
                          >
                            Reason / review note
                            <input
                              value={value.reason}
                              onChange={(event) =>
                                setScores((previous) => ({
                                  ...previous,
                                  [matchId]: {
                                    ...value,
                                    reason: event.target.value,
                                  },
                                }))
                              }
                              style={field}
                            />
                          </label>

                          <Button
                            size="sm"
                            onClick={() =>
                              void run(
                                matchId,
                                () =>
                                  recordTournamentMatchResult(
                                    matchId,
                                    outcomes[matchId] ??
                                      "a_wins",
                                    value.a === ""
                                      ? null
                                      : Number(value.a),
                                    value.b === ""
                                      ? null
                                      : Number(value.b),
                                    value.reason,
                                  ),
                                "Match result recorded and advancement processed.",
                              )
                            }
                            isLoading={busy === matchId}
                          >
                            Record result
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </GlassCard>
            ))
          )}
        </div>
      )}
    </div>
  );
}
