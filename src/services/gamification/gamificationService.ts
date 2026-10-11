import { supabase } from "@/services/supabase/client";
import type { Achievement, LevelConfig, Quest, QuestProgress, Streak, UserAchievement, UserXp, XpTransaction } from "@/types/database.types";

export interface GamificationSnapshot {
  xp: UserXp | null; streak: Streak | null; nextLevel: LevelConfig | null; currentLevel: LevelConfig | null;
  quests: Array<{ quest: Quest; progress: QuestProgress | null }>;
  recentXp: XpTransaction[]; achievements: Achievement[]; earnedAchievements: Array<{ achievement: Achievement; earned: UserAchievement }>; totalAchievements: number;
}

export async function recordGamificationActivity(activityType: "lesson_completion" | "practice_session" | "mock_exam", sourceId: string) {
  const { data, error } = await supabase.rpc("record_gamification_activity", { p_activity_type: activityType, p_source_id: sourceId });
  if (error) throw error;
  return data;
}

export async function getGamificationSnapshot(studentId: string): Promise<GamificationSnapshot> {
  const now = new Date();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const todayKey = key(now); const weekKey = key(monday);
  const [xpRes, streakRes, levelsRes, questsRes, progressRes, txRes, achievementsRes, earnedRes] = await Promise.all([
    supabase.from("user_xp").select("*").eq("student_id", studentId).maybeSingle(),
    supabase.from("streaks").select("*").eq("student_id", studentId).maybeSingle(),
    supabase.from("level_config").select("*").order("level"),
    supabase.from("quests").select("*").eq("is_active", true).order("period").order("title"),
    supabase.from("quest_progress").select("*").eq("student_id", studentId).in("period_start", [todayKey, weekKey]),
    supabase.from("xp_transactions").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(8),
    supabase.from("achievements").select("*").eq("is_active", true).order("created_at"),
    supabase.from("user_achievements").select("*").eq("student_id", studentId).order("earned_at", { ascending: false }),
  ]);
  const errors = [xpRes.error, streakRes.error, levelsRes.error, questsRes.error, progressRes.error, txRes.error, achievementsRes.error, earnedRes.error].filter(Boolean);
  if (errors.length) throw errors[0];
  const levels = (levelsRes.data ?? []) as LevelConfig[]; const xp = (xpRes.data ?? null) as UserXp | null;
  const total = xp?.total_xp ?? 0; const currentLevel = [...levels].reverse().find((level) => level.xp_required <= total) ?? levels[0] ?? null;
  const questRows = (questsRes.data ?? []) as Quest[]; const progressRows = (progressRes.data ?? []) as QuestProgress[];
  const achievements = (achievementsRes.data ?? []) as Achievement[]; const earned = (earnedRes.data ?? []) as UserAchievement[];
  return {
    xp, streak: (streakRes.data ?? null) as Streak | null, currentLevel,
    nextLevel: levels.find((level) => level.xp_required > total) ?? null,
    quests: questRows.map((quest) => ({ quest, progress: progressRows.find((p) => p.quest_id === quest.id && p.period_start === (quest.period === "daily" ? todayKey : weekKey)) ?? null })),
    recentXp: (txRes.data ?? []) as XpTransaction[],
    achievements,
    earnedAchievements: earned.flatMap((row) => { const achievement = achievements.find((item) => item.id === row.achievement_id); return achievement ? [{ achievement, earned: row }] : []; }),
    totalAchievements: achievements.length,
  };
}

export async function listAdminQuests(): Promise<Quest[]> {
  const { data, error } = await supabase.from("quests").select("*").order("period").order("title");
  if (error) throw error; return (data ?? []) as Quest[];
}
export async function saveAdminQuest(input: Partial<Quest> & Pick<Quest, "title" | "period" | "target_type" | "target_count" | "xp_reward">) {
  const payload = { title: input.title.trim(), description: input.description?.trim() || null, period: input.period, target_type: input.target_type, target_count: input.target_count, xp_reward: input.xp_reward, is_active: input.is_active ?? true };
  const query = input.id ? supabase.from("quests").update(payload).eq("id", input.id) : supabase.from("quests").insert(payload);
  const { error } = await query; if (error) throw error;
}
export async function listAdminAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabase.from("achievements").select("*").order("title");
  if (error) throw error; return (data ?? []) as Achievement[];
}
export async function saveAdminAchievement(input: Partial<Achievement> & Pick<Achievement, "code" | "title" | "xp_reward" | "condition_type" | "condition_target">) {
  const payload = { code: input.code.trim().toLowerCase().replace(/\s+/g, "_"), title: input.title.trim(), description: input.description?.trim() || null, icon: input.icon || "award", xp_reward: input.xp_reward, condition_type: input.condition_type, condition_target: input.condition_target, is_active: input.is_active ?? true };
  const query = input.id ? supabase.from("achievements").update(payload).eq("id", input.id) : supabase.from("achievements").insert(payload);
  const { error } = await query; if (error) throw error;
}
export async function listLevelConfig(): Promise<LevelConfig[]> {
  const { data, error } = await supabase.from("level_config").select("*").order("level");
  if (error) throw error; return (data ?? []) as LevelConfig[];
}
export async function saveLevelConfig(level: number, xpRequired: number, title: string) {
  const { error } = await supabase.from("level_config").upsert({ level, xp_required: xpRequired, title: title.trim() || null }, { onConflict: "level" });
  if (error) throw error;
}

export type ActivityXpKey = "default_lesson_xp" | "default_question_xp" | "default_exam_xp" | "streak_bonus_xp";
export const ACTIVITY_XP_LABELS: Record<ActivityXpKey, string> = {
  default_lesson_xp: "Lesson completion XP",
  default_question_xp: "XP per practice question",
  default_exam_xp: "Graded exam XP",
  streak_bonus_xp: "Seven-day streak bonus XP",
};
export async function getActivityXpSettings(): Promise<Record<ActivityXpKey, number>> {
  const keys = Object.keys(ACTIVITY_XP_LABELS) as ActivityXpKey[];
  const { data, error } = await supabase.from("platform_settings").select("key,value").in("key", keys);
  if (error) throw error;
  const defaults: Record<ActivityXpKey, number> = { default_lesson_xp: 10, default_question_xp: 5, default_exam_xp: 20, streak_bonus_xp: 15 };
  for (const row of data ?? []) {
    if (keys.includes(row.key as ActivityXpKey)) {
      const parsed = Number(row.value);
      if (Number.isFinite(parsed) && parsed >= 0) defaults[row.key as ActivityXpKey] = parsed;
    }
  }
  return defaults;
}
export async function saveActivityXpSetting(key: ActivityXpKey, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error("XP must be a whole number between 0 and 10000");
  const { error } = await supabase.from("platform_settings").update({ value }).eq("key", key);
  if (error) throw error;
}
