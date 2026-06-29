import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, MutableRefObject } from "react";
import { createClient } from "@supabase/supabase-js";
import { io, type Socket } from "socket.io-client";
import {
  BadgeCheck,
  Bell,
  Brain,
  Building2,
  Check,
  CheckCheck,
  CircleCheck,
  Clock3,
  Coins,
  Copy,
  Database,
  Download,
  Eye,
  Flame,
  Gavel,
  Globe2,
  GraduationCap,
  Hash,
  History,
  Home,
  ImageUp,
  Inbox,
  KeyRound,
  Landmark,
  Lock,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Palette,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Scale,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  ThumbsUp,
  Trophy,
  Trash2,
  UserRound,
  Users,
  Vote,
  Wallet,
} from "lucide-react";

type Provider = "local" | "google" | "apple" | "naver" | "kakao";
type Role = "admin" | "moderator" | "member";
type VerificationStatus = "verified" | "pending" | "self_reported" | "rejected";
type ChannelVisibility = "public" | "private";
type DebateFormat = "text" | "voice";
type ChannelStatus = "waiting" | "live" | "voting" | "finished";
type ChannelSort = "latest" | "waiting" | "live" | "finished";
type DebatePhase = "ready" | "opening" | "crossfire" | "closing" | "voting" | "finished";
type DebateStance = "agree" | "disagree";
type ReportTargetType = "channel" | "debate_message" | "spectator_message" | "user";
type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
type AiAppealStatus = "pending" | "reviewing" | "resolved" | "dismissed";
type PrivacyRequestStatus = "pending" | "reviewing" | "resolved" | "dismissed";
type SanctionType = "warning" | "suspension";
type NotificationKind = "system" | "role" | "sanction" | "report" | "debate" | "shop" | "profile";
type ProfileAccent = "blue" | "mint" | "violet" | "amber" | "rose";
type ProfileFrame = "clean" | "solid" | "glow";
type ProfileBanner = "plain" | "gradient" | "midnight";
type ServiceNoticeTone = "info" | "warning" | "critical";
type ServiceNoticeDuration = "manual" | "1h" | "4h" | "24h" | "72h";

interface ProfileClaim {
  id: string;
  label: string;
  value: string;
  status: VerificationStatus;
  submittedReason?: string;
  evidenceText?: string;
  evidenceUrl?: string;
  submittedAt?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewMemo?: string;
}

interface ClaimRequestDraft {
  reason: string;
  evidenceText: string;
  evidenceUrl: string;
}

interface UserStats {
  wins: number;
  losses: number;
  aiRating: number;
  voteTrust: number;
}

interface UserAgreementState {
  requiredVersion: string;
  requiredAccepted: boolean;
  acceptedAt?: string;
  acceptedIp?: string;
  documents: {
    terms: string;
    privacy: string;
    community: string;
  };
  updatedAt?: string;
}

interface User {
  id: string;
  loginId: string;
  password: string;
  authProvider: Provider;
  phone: string;
  phoneVerified: boolean;
  displayName: string;
  title: string;
  bio: string;
  photoUrl: string;
  role: Role;
  coins: number;
  accentColor: ProfileAccent;
  profileFrame: ProfileFrame;
  bannerStyle: ProfileBanner;
  featuredBadge: string;
  ownedItemIds: string[];
  claims: ProfileClaim[];
  stats: UserStats;
  agreements?: UserAgreementState;
  deactivatedAt?: string;
  deactivationReason?: string;
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "badge" | "profile" | "channel";
  accent: ProfileAccent;
}

interface Room {
  id: string;
  title: string;
  topic: string;
  createdBy: string;
  createdAt: string;
}

interface ParticipantSnapshot {
  userId: string;
  displayName: string;
  title: string;
  bio: string;
  photoUrl: string;
  accentColor: ProfileAccent;
  profileFrame: ProfileFrame;
  bannerStyle: ProfileBanner;
  featuredBadge: string;
  claims: ProfileClaim[];
  stats: UserStats;
}

interface DebateMessage {
  id: string;
  authorId: string;
  body: string;
  phase?: DebatePhase;
  createdAt: string;
}

interface SpectatorMessage {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface VoteRecord {
  id: string;
  voterId: string;
  targetUserId: string;
  createdAt: string;
}

interface ReactionRecord {
  id: string;
  spectatorId: string;
  targetUserId: string;
  createdAt: string;
}

interface AiCategoryScore {
  logic: number;
  evidence: number;
  rebuttal: number;
  relevance: number;
  conduct: number;
  total: number;
}

interface AiJudgement {
  winnerId: string;
  reasoning: string;
  userScores: Record<string, number>;
  categoryScores: Record<string, AiCategoryScore>;
  voteScores: Record<string, number>;
  finalScores: Record<string, number>;
  decidedAt: string;
}

interface FinalResult {
  winnerId: string;
  loserId?: string;
  transferredCoins?: number;
  resolvedAt?: string;
}

interface VoiceState {
  muted: boolean;
  handRaised: boolean;
  updatedAt?: string;
}

type VoiceConnectionStatus = "idle" | "joining" | "ready" | "calling" | "reconnecting" | "connected" | "error";

interface VoicePeer {
  userId: string;
  displayName?: string;
  joinedAt?: string;
}

interface VoiceJoinResponse {
  ok: boolean;
  error?: string;
  peers?: VoicePeer[];
}

interface VoiceSignalPayload {
  channelId: string;
  fromUserId: string;
  type: "offer" | "answer" | "candidate";
  description?: RTCSessionDescriptionInit | null;
  candidate?: RTCIceCandidateInit | null;
}

interface DebateChannel {
  id: string;
  roomId: string;
  title: string;
  visibility: ChannelVisibility;
  inviteCode?: string;
  disabledInviteCodes?: string[];
  format: DebateFormat;
  status: ChannelStatus;
  phase: DebatePhase;
  createdBy: string;
  participantLimit: number;
  participantIds: string[];
  readyUserIds: string[];
  participantSnapshots: Record<string, ParticipantSnapshot>;
  stanceByUser: Record<string, DebateStance>;
  activeSpeakerId?: string;
  phaseStartedAt?: number;
  phaseEndsAt?: number;
  turnStartedAt?: number;
  remainingSecondsByUser: Record<string, number>;
  voiceStateByUser: Record<string, VoiceState>;
  spectatorIds: string[];
  debateMessages: DebateMessage[];
  spectatorMessages: SpectatorMessage[];
  votes: VoteRecord[];
  reactions: ReactionRecord[];
  coinStake: number;
  aiJudgement?: AiJudgement;
  finalResult?: FinalResult;
  createdAt: string;
}

interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  channelId?: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  assigneeId?: string;
  assigneeName?: string;
  assignedAt?: string;
  reviewMemo?: string;
  statusHistory?: {
    status: ReportStatus;
    actorId: string;
    actorName: string;
    memo?: string;
    createdAt: string;
  }[];
}

interface AiAppealRecord {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  reason: string;
  status: AiAppealStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewMemo?: string;
}

interface UserSanction {
  id: string;
  userId: string;
  actorId: string;
  type: SanctionType;
  reason: string;
  createdAt: string;
  expiresAt?: number;
  revokedAt?: string;
  revokedBy?: string;
  revokedReason?: string;
}

interface UserNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  view?: "arena" | "profile" | "admin" | "wallet";
  channelId?: string;
  roomId?: string;
}

interface PrivacyDeletionRequest {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  status: PrivacyRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewMemo?: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  targetType: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, string>;
  createdAt: string;
  createdAtIso?: string;
}

interface AuditLogFilter {
  query: string;
  action: string;
  targetType: string;
  actor: string;
  date: string;
}

interface CoinLedger {
  id: string;
  type:
    | "signup"
    | "debate_win"
    | "debate_loss"
    | "debate_reward"
    | "debate_result"
    | "admin_grant"
    | "shop_purchase"
    | "shop_reserve";
  userId: string;
  amount: number;
  memo: string;
  createdAt: string;
}

interface ServiceNotice {
  id: string;
  title: string;
  body: string;
  tone: ServiceNoticeTone;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  expiresAt?: string | null;
}

interface PlatformSettings {
  debate: {
    openingSeconds: number;
    closingSeconds: number;
    crossfireSeconds: number;
    maxOpeningChars: number;
    maxDebateChars: number;
    maxReportReasonChars: number;
    defaultCoinStake: number;
    minWinnerRewardCoins: number;
    winnerRewardRate: number;
  };
  moderation: {
    reportReviewThreshold: number;
    suspensionDefaultHours: number;
  };
}

interface AppState {
  users: User[];
  rooms: Room[];
  channels: DebateChannel[];
  ledger: CoinLedger[];
  reports: ReportRecord[];
  aiAppeals: AiAppealRecord[];
  sanctions: UserSanction[];
  notifications: UserNotification[];
  privacyRequests: PrivacyDeletionRequest[];
  auditLogs: AuditLogEntry[];
  serviceNotice: ServiceNotice | null;
  platformSettings: PlatformSettings;
  currentUserId: string | null;
}

type ViewKey = "arena" | "profile" | "admin" | "wallet";
type AuthResult = { ok: boolean; message?: string };
type PhoneCodeResult = AuthResult & {
  devCode?: string;
  expiresAt?: number;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  attemptsRemaining?: number;
  smsProvider?: string;
  smsSent?: boolean;
  smsDeliveryId?: string;
};
type ActionResult = { ok: boolean; message?: string };
type ChannelActionResult = ActionResult & { channelId?: string; roomId?: string };
type RealtimeStatus = "connecting" | "live" | "offline";
type PublicServiceStatusLevel = "operational" | "degraded" | "maintenance";
type LedgerFilter = "all" | "income" | "spending" | "debate" | "shop" | "admin";

interface SignupPayload {
  loginId: string;
  password: string;
  displayName: string;
  phone: string;
  accentColor: ProfileAccent;
}

interface StateUpdatedPayload {
  state: AppState;
  savedAt?: string;
  storage?: "supabase" | "file";
  reason?: string;
}

interface ApiStatePayload {
  error?: string;
  state?: AppState | null;
  csrfToken?: string | null;
  channelId?: string;
  roomId?: string;
}

interface AuthSessionPayload {
  ok?: boolean;
  authenticated?: boolean;
  userId?: string;
  csrfToken?: string | null;
  error?: string;
  reason?: string;
  user?: {
    id: string;
    loginId: string;
    displayName: string;
    role: Role;
    authProvider: Provider;
    phoneVerified: boolean;
    photoUrl?: string;
    accentColor?: ProfileAccent;
    profileFrame?: ProfileFrame;
    agreements?: UserAgreementState;
  } | null;
  session?: {
    expiresAt: string;
    expiresInSeconds: number;
    sameSite: string;
    secure: boolean;
  } | null;
}

type SessionCheckResult = AuthResult & {
  authenticated?: boolean;
  userId?: string;
  displayName?: string;
  role?: Role;
  authProvider?: Provider;
  phoneVerified?: boolean;
  agreementsAccepted?: boolean;
  expiresAt?: string;
  expiresInSeconds?: number;
  sameSite?: string;
  secure?: boolean;
  reason?: string;
  checkedAt?: string;
};

interface ReleaseIdentityRuntime {
  version: string;
  commit: string;
  commitShort: string;
  channel: string;
  buildTime: string | null;
  configured: boolean;
}

interface PublicServiceStatus {
  ok: boolean;
  service: string;
  status: PublicServiceStatusLevel;
  label: string;
  checkedAt: string;
  notice: ServiceNotice | null;
  realtime: {
    enabled: boolean;
    clients: number;
  };
  storage: {
    storage: "supabase" | "file";
    storageMode: "normalized" | "snapshot" | "file";
    supabaseConfigured: boolean;
    normalized: boolean;
  };
  runtime: {
    production: boolean;
    staticAppEnabled: boolean;
    staticAppAvailable: boolean;
    release: ReleaseIdentityRuntime;
    process: {
      startedAt: string;
      uptimeSeconds: number;
      shuttingDown: boolean;
      shutdownStartedAt: string | null;
      shutdownGraceMs: number;
    };
  };
}

interface StorageTableCheck {
  key?: string;
  table: string;
  ok: boolean;
  count: number | null;
  expectedCount?: number;
  error?: string;
}

interface StorageCheckResult {
  ok: boolean;
  storage: "supabase" | "file";
  storageMode: "normalized" | "snapshot" | "file";
  table: string | null;
  tablePrefix: string | null;
  supabaseConfigured: boolean;
  normalized: boolean;
  savedAt?: string | null;
  checkedAt: string;
  expectedCounts: Record<string, number>;
  expectedTotalRows: number;
  appState: {
    users: number;
    rooms: number;
    channels: number;
    ledger: number;
    reports: number;
    auditLogs?: number;
    serviceNotice?: number;
  } | null;
  snapshotTable: StorageTableCheck | null;
  tables: StorageTableCheck[];
}

type StorageSyncResult = ActionResult & {
  counts?: Record<string, number>;
  syncedAt?: string;
  seededAt?: string;
  storageCheck?: StorageCheckResult;
  state?: AppState;
};
type ServiceNoticeUpdateResult = ActionResult & {
  serviceNotice?: ServiceNotice | null;
  state?: AppState;
};
type PlatformSettingsUpdateResult = ActionResult & {
  platformSettings?: PlatformSettings;
  state?: AppState;
};
type StorageRestoreResult = StorageSyncResult & {
  restoredAt?: string;
  validation?: StateBackupValidationResult;
};
interface StateExportResult {
  ok: boolean;
  exportedAt: string;
  exportedBy: string;
  filename: string;
  storage: "supabase" | "file";
  storageMode: "normalized" | "snapshot" | "file";
  savedAt?: string | null;
  secretsIncluded: boolean;
  counts: Record<string, number>;
  state: AppState;
}
interface SecureStateExportResult extends StateExportResult {
  secure: true;
  auditLogged: boolean;
  secretCounts: {
    users: number;
    passwordSecrets: number;
    socialOrPasswordlessUsers: number;
  };
}
interface AuditExportResult {
  ok: boolean;
  exportedAt: string;
  exportedBy: string;
  filename: string;
  csvFilename: string;
  filters?: AuditLogFilter;
  filtered?: boolean;
  totalCount?: number;
  count: number;
  maxAuditLogs?: number;
  retention?: {
    maxLogs: number;
    currentLogs: number;
    percentUsed: number;
    nearLimit: boolean;
    atLimit: boolean;
  };
  storage: "supabase" | "file";
  storageMode: "normalized" | "snapshot" | "file";
  auditLogs: AuditLogEntry[];
  csv: string;
}
interface StateBackupValidationResult {
  ok: boolean;
  valid: boolean;
  checkedAt: string;
  checkedBy: string;
  counts: Record<string, number>;
  currentCounts: Record<string, number>;
  errors: string[];
  warnings: string[];
  secretsIncluded: boolean;
  redactedFields: string[];
  restoreMode: "full-state" | "redacted-state" | "invalid";
  recommendedAction: string;
  storage: "supabase" | "file";
  storageMode: "normalized" | "snapshot" | "file";
}
type ReadinessStatus = "ready" | "warning" | "blocked";
interface ReadinessCheckItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  action?: string;
  phase?: string;
  priority?: "required" | "recommended";
  required?: boolean;
}
interface ReadinessPhaseSummary {
  phase: string;
  label: string;
  total: number;
  ready: number;
  warning: number;
  blocked: number;
  requiredOpen: number;
}
interface LaunchReadinessReport {
  generatedAt: string;
  filename: string;
  jsonFilename: string;
  summary: string;
  markdown: string;
}
interface LaunchCommand {
  id: string;
  label: string;
  command: string;
  detail: string;
}
interface LaunchEvidenceItem {
  id: string;
  label: string;
  artifact: string;
  command?: string;
  required: boolean;
}
interface LaunchEvidence {
  generatedAt: string;
  packageFilename: string;
  checklist: LaunchEvidenceItem[];
}
type LaunchHandoffStatus = "ready" | "pending" | "blocked";
interface LaunchHandoffCommand {
  id: string;
  label: string;
  command: string;
  required: boolean;
  detail: string;
}
interface LaunchHandoffChecklistItem {
  id: string;
  label: string;
  status: LaunchHandoffStatus;
  detail: string;
  command?: string;
  artifact?: string;
}
interface LaunchHandoff {
  generatedAt: string;
  filename: string;
  markdownFilename: string;
  status: LaunchHandoffStatus;
  label: string;
  summary: string;
  goNoGo: {
    canLaunch: boolean;
    strictReady: boolean;
    localReady: boolean;
    requiredOpen: number;
    blockers: number;
  };
  commands: LaunchHandoffCommand[];
  artifacts: string[];
  checklist: LaunchHandoffChecklistItem[];
  markdown: string;
}
type LaunchPromotionGateStatus = "ready" | "partial" | "blocked";
type LaunchPromotionStrictStatus = "ready" | "pending" | "blocked";
interface LaunchPromotionGateArtifact {
  id: string;
  label: string;
  path: string;
  command: string;
  required: boolean;
  checkedAt: string;
  exists: boolean;
  fresh: boolean;
  ok: boolean;
  blocking: boolean;
  status: string;
  detail: string;
  ageMinutes: number | null;
  generatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  mode: string | null;
  strict: boolean | null;
}
interface LaunchPromotionGateStrict {
  status: LaunchPromotionStrictStatus;
  label: string;
  detail: string;
  command: string;
  artifactId: string;
  currentMode: string;
  ready: boolean;
  localReady: boolean;
}
interface LaunchPromotionGate {
  status: LaunchPromotionGateStatus;
  label: string;
  detail: string;
  generatedAt: string;
  maxAgeHours: number;
  requiredCount: number;
  readyCount: number;
  blockedCount: number;
  strict?: LaunchPromotionGateStrict;
  artifacts: LaunchPromotionGateArtifact[];
  nextActions: string[];
}
interface LaunchReadinessSummary {
  status: ReadinessStatus;
  label: string;
  headline: string;
  blockers: ReadinessCheckItem[];
  warnings: ReadinessCheckItem[];
  requiredOpen: ReadinessCheckItem[];
  recommendedOpen: ReadinessCheckItem[];
  phaseSummary: ReadinessPhaseSummary[];
  nextActions: string[];
  env: string[];
  envTemplate: string;
  commands: LaunchCommand[];
  report?: LaunchReadinessReport;
  evidence?: LaunchEvidence;
  handoff?: LaunchHandoff;
  promotionGate?: LaunchPromotionGate;
}
interface RateLimitRuntime {
  authWindowSeconds: number;
  writeWindowSeconds: number;
  loginMax: number;
  signupMax: number;
  socialMax: number;
  demoMax: number;
  phoneRequestMax: number;
  phoneVerifyMax: number;
  passwordMax: number;
  messageMax: number;
  reportMax: number;
  phoneCodeTtlSeconds: number;
  phoneCodeResendSeconds: number;
  phoneCodeMaxAttempts: number;
  activeBuckets: number;
}
interface ProviderDiagnosticsRuntime {
  sms: {
    provider: string;
    configured: boolean;
    realProvider: boolean;
    senderConfigured: boolean;
    debugCodeExposed: boolean;
    productionReady: boolean;
  };
  oauth: {
    serverConfigured: boolean;
    clientConfigured: boolean;
    anonKeyPresent: boolean;
    productionReady: boolean;
  };
  ai: {
    configured: boolean;
    model: string;
    forceLocal: boolean;
    productionReady: boolean;
  };
  storage: {
    storage: "supabase" | "file";
    storageMode: "normalized" | "snapshot" | "file";
    supabaseConfigured: boolean;
    normalized: boolean;
    productionReady: boolean;
  };
}
interface OperationalReadinessResult {
  ok: boolean;
  checkedAt: string;
  summary: {
    ready: number;
    warning: number;
    blocked: number;
    total: number;
    score: number;
  };
  launch: LaunchReadinessSummary;
  runtime: {
    production: boolean;
    nodeEnv: string;
    demoAuthEnabled: boolean;
    openStateWriteEnabled: boolean;
    phoneDebugCodeExposed: boolean;
    aiJudgeForceLocal: boolean;
    staticAppEnabled: boolean;
    staticAppAvailable: boolean;
    permissionsPolicy: string;
    apiHost: string;
    allowedOrigins: string[];
    release: ReleaseIdentityRuntime;
    rateLimits: RateLimitRuntime;
    process: {
      pid: number;
      startedAt: string;
      uptimeSeconds: number;
      shuttingDown: boolean;
      shutdownStartedAt: string | null;
      shutdownGraceMs: number;
    };
    providerDiagnostics: ProviderDiagnosticsRuntime;
  };
  service: {
    realtime: boolean;
    clients: number;
    aiJudgeConfigured: boolean;
    judgeModel: string;
    smsProvider: string;
    smsConfigured: boolean;
    oauthConfigured: boolean;
    release: ReleaseIdentityRuntime;
    storage: "supabase" | "file";
    storageMode: "normalized" | "snapshot" | "file";
    supabaseConfigured: boolean;
    normalized: boolean;
    users: number;
    channels: number;
    reports: number;
    platformSettings: PlatformSettings;
  };
  checks: ReadinessCheckItem[];
}
interface ReadinessGuide {
  title: string;
  body: string;
  envSnippet: string;
  steps: string[];
}

const STORAGE_KEY = "nosu-best-debate-state-v1";
const API_BASE = "/api";
const SECURE_BACKUP_CONFIRMATION = "EXPORT FULL BACKUP";
const RESTORE_BACKUP_CONFIRMATION = "RESTORE FULL BACKUP";
const SUPABASE_AUTH_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_AUTH_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseAuth =
  SUPABASE_AUTH_URL && SUPABASE_AUTH_ANON_KEY
    ? createClient(SUPABASE_AUTH_URL, SUPABASE_AUTH_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;
const OPENING_SECONDS = 90;
const CLOSING_SECONDS = 60;
const CROSSFIRE_SECONDS = 300;
const MAX_DEBATE_CHARS = 500;
const MAX_OPENING_CHARS = 800;
const MAX_SPECTATOR_CHARS = 300;
const MAX_PROFILE_PHOTO_BYTES = 1_000_000;
const defaultPlatformSettings: PlatformSettings = {
  debate: {
    openingSeconds: OPENING_SECONDS,
    closingSeconds: CLOSING_SECONDS,
    crossfireSeconds: CROSSFIRE_SECONDS,
    maxOpeningChars: MAX_OPENING_CHARS,
    maxDebateChars: MAX_DEBATE_CHARS,
    maxReportReasonChars: 140,
    defaultCoinStake: 80,
    minWinnerRewardCoins: 30,
    winnerRewardRate: 0.6,
  },
  moderation: {
    reportReviewThreshold: 3,
    suspensionDefaultHours: 24,
  },
};
const appRouteViews: ViewKey[] = ["arena", "profile", "admin", "wallet"];

interface AppRoute {
  view?: ViewKey;
  roomId?: string;
  channelId?: string;
}

function hasOAuthCallbackParams(hash: string, search: string) {
  return hash.includes("access_token") || search.includes("code=") || search.includes("provider=");
}

function parseAppRouteHash(hash: string): AppRoute {
  const routeHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!routeHash || routeHash.includes("access_token")) return {};

  const params = new URLSearchParams(routeHash);
  const view = params.get("view");
  const roomId = params.get("room") ?? undefined;
  const channelId = params.get("channel") ?? undefined;

  return {
    view: appRouteViews.includes(view as ViewKey) ? (view as ViewKey) : undefined,
    roomId,
    channelId,
  };
}

function buildAppRouteHash(view: ViewKey, roomId?: string, channelId?: string) {
  const params = new URLSearchParams({ view });
  if (view === "arena") {
    if (roomId) params.set("room", roomId);
    if (channelId) params.set("channel", channelId);
  }
  return `#${params.toString()}`;
}

function buildCurrentAppUrl(view: ViewKey, roomId?: string, channelId?: string) {
  return `${window.location.origin}${window.location.pathname}${window.location.search}${buildAppRouteHash(
    view,
    roomId,
    channelId,
  )}`;
}

const authErrorMessages: Record<string, string> = {
  not_authenticated: "로그인이 만료되었습니다. 다시 로그인해주세요.",
  csrf_invalid: "보안 토큰이 만료되었습니다. 새로고침 후 다시 시도해주세요.",
  state_not_ready: "서버 상태가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
  invalid_credentials: "아이디 또는 비밀번호가 맞지 않습니다. 데모 계정은 nosu / demo 입니다.",
  missing_required_fields: "아이디, 비밀번호, 닉네임, 전화번호를 모두 입력해주세요.",
  weak_password: "비밀번호는 6자 이상으로 만들어주세요.",
  invalid_phone: "전화번호는 010-0000-0000 형식으로 입력해주세요.",
  duplicate_login_id: "이미 사용 중인 아이디입니다.",
  duplicate_phone: "이미 다른 계정에서 인증한 전화번호입니다.",
  invalid_provider: "지원하지 않는 간편 로그인입니다.",
  invalid_oauth_session: "간편 로그인 세션을 확인할 수 없습니다. 다시 시도해주세요.",
  invalid_reset_identity: "아이디와 전화번호가 일치하는 계정을 찾을 수 없습니다.",
  password_reset_code_not_requested: "먼저 비밀번호 재설정 인증번호를 받아주세요.",
  password_reset_code_expired: "인증번호가 만료되었습니다. 다시 받아주세요.",
  invalid_password_reset_code: "비밀번호 재설정 인증번호가 맞지 않습니다.",
  password_reset_code_too_many_attempts: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.",
  account_deactivated: "탈퇴 처리된 계정입니다.",
  demo_auth_disabled: "운영 환경에서는 데모 계정 전환이 비활성화되어 있습니다.",
  user_not_found: "계정을 찾을 수 없습니다.",
  invalid_phone_code: "인증번호가 맞지 않습니다. 새 인증번호를 다시 확인해주세요.",
  phone_code_not_requested: "먼저 인증번호를 받아주세요.",
  phone_code_expired: "인증번호가 만료되었습니다. 다시 받아주세요.",
  phone_code_rate_limited: "인증번호를 너무 자주 요청했습니다. 잠시 후 다시 시도해주세요.",
  phone_code_too_many_attempts: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.",
  sms_provider_not_configured: "SMS 발송 설정이 아직 연결되지 않았습니다. 운영자에게 문의해주세요.",
  sms_send_failed: "SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
  provider_password_disabled: "간편 로그인 계정은 비밀번호를 직접 변경할 수 없습니다.",
  invalid_current_password: "현재 비밀번호가 일치하지 않습니다.",
  invalid_account_deactivation_confirmation: "탈퇴 확인 문구를 정확히 입력해주세요.",
  cannot_deactivate_last_admin: "마지막 운영자 계정은 탈퇴할 수 없습니다.",
  account_has_active_debate: "진행 중인 토론을 마친 뒤 탈퇴할 수 있습니다.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
};

const channelErrorMessages: Record<string, string> = {
  not_authenticated: "로그인이 만료되었습니다. 다시 로그인해주세요.",
  csrf_invalid: "보안 토큰이 만료되었습니다. 새로고침 후 다시 시도해주세요.",
  state_not_ready: "서버 상태가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.",
  rate_limited: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  user_not_found: "계정을 찾을 수 없습니다.",
  room_not_found: "주제 방을 찾을 수 없습니다.",
  channel_not_found: "채널을 찾을 수 없습니다.",
  invalid_channel_payload: "채널 정보를 다시 확인해주세요.",
  channel_not_joinable: "지금은 이 채널에 참가할 수 없습니다.",
  channel_leave_locked: "토론이 시작된 참가자는 채널을 나갈 수 없습니다. 운영자에게 문의해주세요.",
  not_channel_member: "현재 이 채널에 입장해 있지 않습니다.",
  private_channel_requires_code: "비공개 채널은 입장 코드가 필요합니다.",
  channel_full: "이미 참가자가 모두 입장했습니다.",
  invalid_invite_code: "활성 상태로 일치하는 비공개 입장 코드가 없습니다.",
  inactive_invite_code: "비활성화된 입장 코드입니다. 방장이나 운영자에게 새 코드를 요청해주세요.",
  not_channel_manager: "채널 생성자 또는 운영자만 입장 코드를 관리할 수 있습니다.",
  channel_invite_not_available: "비공개 채널에서만 입장 코드를 관리할 수 있습니다.",
  invalid_room_payload: "방 이름과 토론 주제를 입력해주세요.",
  cannot_delete_last_room: "마지막 주제 방은 삭제할 수 없습니다.",
  not_participant: "토론 참가자만 사용할 수 있는 기능입니다.",
  not_spectator: "관전 입장 후 채팅할 수 있습니다.",
  not_enough_participants: "두 명의 참가자가 모두 입장해야 토론을 시작할 수 있습니다.",
  invalid_debate_phase: "지금 단계에서는 실행할 수 없습니다.",
  channel_not_ready_phase: "준비 단계에서만 변경할 수 있습니다.",
  invalid_stance: "스탠스를 다시 선택해주세요.",
  not_all_ready: "두 참가자가 모두 준비 완료해야 시작할 수 있습니다.",
  debate_not_live: "토론 진행 중에만 사용할 수 있습니다.",
  not_active_speaker: "현재 발언권자가 아닙니다.",
  turn_not_passable: "지금은 턴을 넘길 수 없습니다.",
  not_authorized: "이 작업을 실행할 권한이 없습니다.",
  empty_message: "메시지를 입력해주세요.",
  message_too_long: "메시지가 너무 깁니다.",
  speaking_time_over: "발언 시간이 종료되었습니다.",
  channel_finished: "종료된 채널에는 채팅할 수 없습니다.",
  not_voice_channel: "음성 토론 채널에서만 사용할 수 있습니다.",
  voting_not_open: "아직 투표가 열리지 않았습니다.",
  invalid_vote_target: "투표 대상을 다시 확인해주세요.",
  participant_cannot_vote: "토론 참가자는 본인 토론에 투표할 수 없습니다.",
  duplicate_vote: "이미 이 토론에 투표했습니다.",
  invalid_reaction_target: "공감 대상을 다시 확인해주세요.",
  participant_cannot_react: "토론 참가자는 관전자 공감을 누를 수 없습니다.",
  invalid_report_target: "신고 대상을 다시 확인해주세요.",
  report_target_not_found: "신고 대상을 찾을 수 없습니다.",
  duplicate_report: "이미 접수된 신고입니다.",
  invalid_report_status: "신고 처리 상태를 다시 확인해주세요.",
  user_suspended: "운영 정책 위반으로 일시 정지된 계정입니다.",
  judge_in_progress: "AI 판정이 이미 진행 중입니다. 잠시만 기다려주세요.",
  debate_result_not_ready: "AI 판정이 완료된 종료 토론에서만 이의제기를 제출할 수 있습니다.",
  missing_appeal_reason: "이의제기 사유를 입력해주세요.",
  duplicate_ai_appeal: "이미 이 토론 결과에 이의제기를 제출했습니다.",
  ai_appeal_not_found: "이의제기 기록을 찾을 수 없습니다.",
  invalid_ai_appeal_status: "이의제기 처리 상태를 다시 확인해주세요.",
  invalid_role: "변경할 권한을 다시 확인해주세요.",
  cannot_update_self_role: "본인 권한은 직접 변경할 수 없습니다.",
  invalid_sanction_payload: "제재 종류와 사유를 다시 확인해주세요.",
  sanction_not_found: "제재 기록을 찾을 수 없습니다.",
  cannot_sanction_self: "본인 계정은 제재할 수 없습니다.",
  cannot_sanction_privileged: "운영 권한 계정은 메인 운영자만 제재할 수 있습니다.",
  invalid_claim_status: "인증 상태를 다시 확인해주세요.",
  missing_claim_reason: "인증 요청 사유를 입력해주세요.",
  invalid_claim_evidence: "증빙 URL은 http 또는 https 주소만 사용할 수 있습니다.",
  missing_review_memo: "반려하려면 심사 메모를 입력해주세요.",
  claim_not_found: "인증 항목을 찾을 수 없습니다.",
  report_not_found: "신고 항목을 찾을 수 없습니다.",
  notification_not_found: "알림을 찾을 수 없습니다.",
  not_notification_owner: "본인 알림만 처리할 수 있습니다.",
  invalid_profile_payload: "닉네임과 대표 타이틀을 입력해주세요.",
  invalid_profile_photo: "프로필 사진 형식을 다시 확인해주세요.",
  profile_photo_too_large: "프로필 사진은 1MB 이하 이미지만 사용할 수 있습니다.",
  profile_photo_upload_failed: "프로필 사진 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
  shop_item_not_found: "상점 아이템을 찾을 수 없습니다.",
  shop_item_already_owned: "이미 보유한 아이템입니다.",
  insufficient_coins: "코인이 부족합니다.",
  invalid_coin_adjustment: "코인 조정 금액은 0이 아닌 100,000 이내의 숫자로 입력해주세요.",
  missing_adjustment_reason: "코인 조정 사유를 입력해주세요.",
  negative_coin_balance: "차감 후 잔액이 음수가 되는 조정은 거절되었습니다.",
  privacy_request_not_found: "개인정보 요청을 찾을 수 없습니다.",
  invalid_privacy_request_status: "개인정보 요청 처리 상태를 다시 확인해주세요.",
  supabase_not_configured: "Supabase 환경변수가 아직 설정되지 않았습니다.",
  invalid_service_notice: "공지 제목과 본문을 입력해주세요.",
  invalid_platform_settings: "운영 정책 설정 범위를 다시 확인해주세요.",
};

const providerLabels: Record<Provider, string> = {
  local: "아이디",
  google: "Google",
  apple: "Apple",
  naver: "Naver",
  kakao: "Kakao",
};

const statusLabels: Record<ChannelStatus, string> = {
  waiting: "참가 대기",
  live: "토론 진행",
  voting: "투표/판정",
  finished: "종료",
};

const serviceNoticeToneLabels: Record<ServiceNoticeTone, string> = {
  info: "안내",
  warning: "점검",
  critical: "긴급",
};

const serviceNoticeDurationLabels: Record<ServiceNoticeDuration, string> = {
  manual: "수동으로 내리기",
  "1h": "1시간 후 자동 해제",
  "4h": "4시간 후 자동 해제",
  "24h": "24시간 후 자동 해제",
  "72h": "72시간 후 자동 해제",
};

const serviceNoticeDurationHours: Partial<Record<ServiceNoticeDuration, number>> = {
  "1h": 1,
  "4h": 4,
  "24h": 24,
  "72h": 72,
};

const phaseLabels: Record<DebatePhase, string> = {
  ready: "스탠스 확정",
  opening: "기조 발언",
  crossfire: "크로스파이어",
  closing: "최종 변론",
  voting: "관전자 투표",
  finished: "결과 발표",
};

const stanceLabels: Record<DebateStance, string> = {
  agree: "찬성",
  disagree: "반대",
};

const verificationLabels: Record<VerificationStatus, string> = {
  verified: "인증됨",
  pending: "검토중",
  self_reported: "본인 작성",
  rejected: "반려",
};

const reportStatusLabels: Record<ReportStatus, string> = {
  open: "접수",
  reviewing: "검토중",
  resolved: "조치 완료",
  dismissed: "기각",
};

const aiAppealStatusLabels: Record<AiAppealStatus, string> = {
  pending: "검토 대기",
  reviewing: "검토중",
  resolved: "재검토 완료",
  dismissed: "기각",
};

const privacyRequestStatusLabels: Record<PrivacyRequestStatus, string> = {
  pending: "접수",
  reviewing: "검토중",
  resolved: "처리 완료",
  dismissed: "보류/기각",
};

const roleLabels: Record<Role, string> = {
  admin: "메인 운영자",
  moderator: "운영진",
  member: "회원",
};

const auditActionLabels: Record<string, string> = {
  admin_sync_normalized: "저장소 동기화",
  admin_platform_settings_update: "운영 정책 변경",
  admin_service_notice_update: "운영 공지 변경",
  admin_service_notice_clear: "운영 공지 해제",
  admin_room_create: "방 생성",
  admin_room_update: "방 수정",
  admin_room_delete: "방 삭제",
  admin_user_role_update: "권한 변경",
  admin_user_sanction_create: "제재 부여",
  admin_user_sanction_revoke: "제재 해제",
  admin_claim_verify: "이력 검토",
  admin_report_resolve: "신고 처리",
  admin_channel_finish: "채널 종료",
  admin_channel_delete: "채널 삭제",
  admin_profile_update: "프로필 수정",
  privacy_delete_request_create: "삭제 요청 접수",
  admin_privacy_request_update: "개인정보 요청 처리",
  admin_coin_adjust: "코인 조정",
};

const defaultProfileStyle = {
  accentColor: "blue" as ProfileAccent,
  profileFrame: "clean" as ProfileFrame,
  bannerStyle: "plain" as ProfileBanner,
  featuredBadge: "신규 토론러",
};

const requiredAgreementVersion = "2026-06-28";
const requiredAgreementDocuments = {
  terms: "terms-2026-06-28",
  privacy: "privacy-2026-06-28",
  community: "community-rules-2026-06-28",
};
const AUDIT_LOG_RETENTION_LIMIT = 300;
const AUDIT_LOG_RENDER_LIMIT = 40;

const defaultAgreementState = (accepted = true): UserAgreementState => ({
  requiredVersion: requiredAgreementVersion,
  requiredAccepted: accepted,
  acceptedAt: accepted ? "legacy" : "",
  acceptedIp: "",
  documents: { ...requiredAgreementDocuments },
  updatedAt: accepted ? "legacy" : "",
});

const normalizeAgreementState = (agreement?: Partial<UserAgreementState> | null): UserAgreementState => {
  if (!agreement) return defaultAgreementState(true);
  const documents: Partial<UserAgreementState["documents"]> = agreement.documents ?? {};
  const requiredAccepted =
    Boolean(agreement.requiredAccepted) &&
    agreement.requiredVersion === requiredAgreementVersion &&
    documents.terms === requiredAgreementDocuments.terms &&
    documents.privacy === requiredAgreementDocuments.privacy &&
    documents.community === requiredAgreementDocuments.community;
  return {
    requiredVersion: requiredAgreementVersion,
    requiredAccepted,
    acceptedAt: requiredAccepted ? agreement.acceptedAt ?? agreement.updatedAt ?? "" : "",
    acceptedIp: requiredAccepted ? agreement.acceptedIp ?? "" : "",
    documents: { ...requiredAgreementDocuments },
    updatedAt: requiredAccepted ? agreement.updatedAt ?? agreement.acceptedAt ?? "" : "",
  };
};

const hasRequiredAgreements = (user?: User | null) =>
  Boolean(user && normalizeAgreementState(user.agreements).requiredAccepted);

const accentOptions: Array<{ value: ProfileAccent; label: string }> = [
  { value: "blue", label: "토스 블루" },
  { value: "mint", label: "민트" },
  { value: "violet", label: "바이올렛" },
  { value: "amber", label: "앰버" },
  { value: "rose", label: "로즈" },
];

const frameOptions: Array<{ value: ProfileFrame; label: string }> = [
  { value: "clean", label: "클린" },
  { value: "solid", label: "솔리드" },
  { value: "glow", label: "글로우" },
];

const bannerOptions: Array<{ value: ProfileBanner; label: string }> = [
  { value: "plain", label: "심플" },
  { value: "gradient", label: "그라데이션" },
  { value: "midnight", label: "미드나잇" },
];

const shopItems: ShopItem[] = [
  {
    id: "badge_logic",
    name: "논리왕 배지",
    description: "프로필 대표 배지로 쓰기 좋은 토론가 배지",
    price: 120,
    category: "badge",
    accent: "blue",
  },
  {
    id: "badge_counter",
    name: "반박 장인",
    description: "반박 중심 토론러에게 어울리는 프로필 아이템",
    price: 160,
    category: "badge",
    accent: "violet",
  },
  {
    id: "profile_glow",
    name: "글로우 프레임권",
    description: "프로필 프레임을 더 눈에 띄게 꾸미는 아이템",
    price: 220,
    category: "profile",
    accent: "mint",
  },
  {
    id: "channel_ticket",
    name: "프리미엄 채널권",
    description: "추후 프리미엄 토론 채널 생성에 사용할 입장권",
    price: 300,
    category: "channel",
    accent: "amber",
  },
];

const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

const nowLabel = () =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

const snapshotUser = (user: User): ParticipantSnapshot => ({
  userId: user.id,
  displayName: user.displayName,
  title: user.title,
  bio: user.bio,
  photoUrl: user.photoUrl,
  accentColor: user.accentColor ?? defaultProfileStyle.accentColor,
  profileFrame: user.profileFrame ?? defaultProfileStyle.profileFrame,
  bannerStyle: user.bannerStyle ?? defaultProfileStyle.bannerStyle,
  featuredBadge: user.featuredBadge ?? defaultProfileStyle.featuredBadge,
  claims: user.claims,
  stats: user.stats,
});

const normalizeUser = (user: User): User => ({
  ...user,
  accentColor: user.accentColor ?? defaultProfileStyle.accentColor,
  profileFrame: user.profileFrame ?? defaultProfileStyle.profileFrame,
  bannerStyle: user.bannerStyle ?? defaultProfileStyle.bannerStyle,
  featuredBadge: user.featuredBadge ?? defaultProfileStyle.featuredBadge,
  ownedItemIds: user.ownedItemIds ?? [],
  agreements: normalizeAgreementState(user.agreements),
});

const isActiveUser = (user?: User | null) => Boolean(user && !user.deactivatedAt);

const normalizeSnapshot = (snapshot: Partial<ParticipantSnapshot>): ParticipantSnapshot => ({
  userId: snapshot.userId ?? "",
  displayName: snapshot.displayName ?? "참가자",
  title: snapshot.title ?? "",
  bio: snapshot.bio ?? "",
  photoUrl: snapshot.photoUrl ?? "",
  accentColor: snapshot.accentColor ?? defaultProfileStyle.accentColor,
  profileFrame: snapshot.profileFrame ?? defaultProfileStyle.profileFrame,
  bannerStyle: snapshot.bannerStyle ?? defaultProfileStyle.bannerStyle,
  featuredBadge: snapshot.featuredBadge ?? defaultProfileStyle.featuredBadge,
  claims: snapshot.claims ?? [],
  stats: snapshot.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
});

const normalizeVoiceState = (voiceState?: Partial<VoiceState>): VoiceState => ({
  muted: voiceState?.muted ?? true,
  handRaised: voiceState?.handRaised ?? false,
  updatedAt: voiceState?.updatedAt,
});

const phaseFromStatus = (status: ChannelStatus): DebatePhase => {
  if (status === "waiting") return "ready";
  if (status === "voting") return "voting";
  if (status === "finished") return "finished";
  return "crossfire";
};

const normalizeChannel = (channel: DebateChannel): DebateChannel => {
  const phase = channel.phase ?? phaseFromStatus(channel.status);
  const stanceByUser = Object.fromEntries(
    channel.participantIds.map((participantId, index) => [
      participantId,
      channel.stanceByUser?.[participantId] ?? (index === 0 ? "agree" : "disagree"),
    ]),
  ) as Record<string, DebateStance>;
  const remainingSecondsByUser = Object.fromEntries(
    channel.participantIds.map((participantId) => [
      participantId,
      channel.remainingSecondsByUser?.[participantId] ?? CROSSFIRE_SECONDS,
    ]),
  ) as Record<string, number>;
  const voiceStateByUser = Object.fromEntries(
    channel.participantIds.map((participantId) => [
      participantId,
      normalizeVoiceState(channel.voiceStateByUser?.[participantId]),
    ]),
  ) as Record<string, VoiceState>;

  return {
    ...channel,
    phase,
    stanceByUser,
    readyUserIds: (channel.readyUserIds ?? []).filter((userId) => channel.participantIds.includes(userId)),
    activeSpeakerId: channel.activeSpeakerId ?? (channel.status === "live" ? channel.participantIds[0] : undefined),
    remainingSecondsByUser,
    voiceStateByUser,
    reactions: channel.reactions ?? [],
    disabledInviteCodes: channel.disabledInviteCodes ?? [],
    participantSnapshots: Object.fromEntries(
      Object.entries(channel.participantSnapshots ?? {}).map(([userId, snapshot]) => [
        userId,
        normalizeSnapshot(snapshot),
      ]),
    ),
  };
};

const serviceNoticeTones = new Set<ServiceNoticeTone>(["info", "warning", "critical"]);

const normalizeServiceNotice = (notice?: ServiceNotice | null): ServiceNotice | null => {
  if (!notice || notice.active === false) return null;
  const title = String(notice.title ?? "").trim().slice(0, 80);
  const body = String(notice.body ?? "").trim().slice(0, 220);
  if (!title || !body) return null;
  const tone = serviceNoticeTones.has(notice.tone) ? notice.tone : "info";
  const updatedAt = notice.updatedAt && !Number.isNaN(new Date(notice.updatedAt).getTime())
    ? notice.updatedAt
    : new Date().toISOString();
  const expiresAt = notice.expiresAt && !Number.isNaN(new Date(notice.expiresAt).getTime())
    ? new Date(notice.expiresAt).toISOString()
    : null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;
  return {
    id: String(notice.id ?? "service_notice").slice(0, 80),
    title,
    body,
    tone,
    active: true,
    updatedAt,
    updatedBy: String(notice.updatedBy ?? "").slice(0, 80),
    expiresAt,
  };
};

const clampPlatformSetting = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = true,
) => {
  const parsed = Number(value ?? fallback);
  const safeValue = Number.isFinite(parsed) ? parsed : fallback;
  const clamped = Math.max(min, Math.min(max, safeValue));
  return integer ? Math.round(clamped) : Number(clamped.toFixed(2));
};

const normalizePlatformSettings = (settings?: Partial<PlatformSettings> | null): PlatformSettings => ({
  debate: {
    openingSeconds: clampPlatformSetting(settings?.debate?.openingSeconds, defaultPlatformSettings.debate.openingSeconds, 30, 600),
    closingSeconds: clampPlatformSetting(settings?.debate?.closingSeconds, defaultPlatformSettings.debate.closingSeconds, 30, 600),
    crossfireSeconds: clampPlatformSetting(settings?.debate?.crossfireSeconds, defaultPlatformSettings.debate.crossfireSeconds, 30, 600),
    maxOpeningChars: clampPlatformSetting(settings?.debate?.maxOpeningChars, defaultPlatformSettings.debate.maxOpeningChars, 100, 3000),
    maxDebateChars: clampPlatformSetting(settings?.debate?.maxDebateChars, defaultPlatformSettings.debate.maxDebateChars, 100, 2000),
    maxReportReasonChars: clampPlatformSetting(settings?.debate?.maxReportReasonChars, defaultPlatformSettings.debate.maxReportReasonChars, 20, 500),
    defaultCoinStake: clampPlatformSetting(settings?.debate?.defaultCoinStake, defaultPlatformSettings.debate.defaultCoinStake, 0, 10000),
    minWinnerRewardCoins: clampPlatformSetting(settings?.debate?.minWinnerRewardCoins, defaultPlatformSettings.debate.minWinnerRewardCoins, 0, 10000),
    winnerRewardRate: clampPlatformSetting(settings?.debate?.winnerRewardRate, defaultPlatformSettings.debate.winnerRewardRate, 0, 1, false),
  },
  moderation: {
    reportReviewThreshold: clampPlatformSetting(settings?.moderation?.reportReviewThreshold, defaultPlatformSettings.moderation.reportReviewThreshold, 1, 20),
    suspensionDefaultHours: clampPlatformSetting(settings?.moderation?.suspensionDefaultHours, defaultPlatformSettings.moderation.suspensionDefaultHours, 1, 720),
  },
});

const normalizeAppState = (state: AppState): AppState => ({
  ...state,
  users: state.users.map(normalizeUser),
  channels: state.channels.map(normalizeChannel),
  reports: state.reports ?? [],
  aiAppeals: state.aiAppeals ?? [],
  sanctions: state.sanctions ?? [],
  notifications: state.notifications ?? [],
  privacyRequests: state.privacyRequests ?? [],
  auditLogs: state.auditLogs ?? [],
  serviceNotice: normalizeServiceNotice(state.serviceNotice),
  platformSettings: normalizePlatformSettings(state.platformSettings),
  currentUserId: state.currentUserId ?? null,
});

const formatClock = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const elapsedSeconds = (startedAt?: number, nowMs = Date.now()) =>
  startedAt ? Math.max(0, (nowMs - startedAt) / 1000) : 0;

const activeRemainingSeconds = (channel: DebateChannel, userId: string, nowMs = Date.now()) => {
  if (channel.phase === "opening" || channel.phase === "closing") {
    if (channel.activeSpeakerId !== userId) {
      return channel.phase === "opening" ? OPENING_SECONDS : CLOSING_SECONDS;
    }
    return Math.max(0, ((channel.phaseEndsAt ?? nowMs) - nowMs) / 1000);
  }

  const base = channel.remainingSecondsByUser[userId] ?? CROSSFIRE_SECONDS;
  if (channel.phase !== "crossfire" || channel.activeSpeakerId !== userId) return base;
  return Math.max(0, base - elapsedSeconds(channel.turnStartedAt, nowMs));
};

const captureCrossfireClock = (channel: DebateChannel, nowMs = Date.now()) => {
  if (channel.phase !== "crossfire" || !channel.activeSpeakerId) return channel.remainingSecondsByUser;
  return {
    ...channel.remainingSecondsByUser,
    [channel.activeSpeakerId]: Math.max(
      0,
      activeRemainingSeconds(channel, channel.activeSpeakerId, nowMs),
    ),
  };
};

const advanceDebateChannel = (channel: DebateChannel, nowMs = Date.now()): DebateChannel => {
  const [firstId, secondId] = channel.participantIds;
  if (!firstId || !secondId) return channel;

  if (channel.phase === "ready") {
    return {
      ...channel,
      status: "live",
      phase: "opening",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + OPENING_SECONDS * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "opening" && channel.activeSpeakerId === firstId) {
    return {
      ...channel,
      activeSpeakerId: secondId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + OPENING_SECONDS * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "opening") {
    return {
      ...channel,
      phase: "crossfire",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: undefined,
      turnStartedAt: nowMs,
      remainingSecondsByUser: {
        ...channel.remainingSecondsByUser,
        [firstId]: channel.remainingSecondsByUser[firstId] ?? CROSSFIRE_SECONDS,
        [secondId]: channel.remainingSecondsByUser[secondId] ?? CROSSFIRE_SECONDS,
      },
    };
  }

  if (channel.phase === "crossfire") {
    return {
      ...channel,
      phase: "closing",
      activeSpeakerId: firstId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + CLOSING_SECONDS * 1000,
      turnStartedAt: nowMs,
      remainingSecondsByUser: captureCrossfireClock(channel, nowMs),
    };
  }

  if (channel.phase === "closing" && channel.activeSpeakerId === firstId) {
    return {
      ...channel,
      activeSpeakerId: secondId,
      phaseStartedAt: nowMs,
      phaseEndsAt: nowMs + CLOSING_SECONDS * 1000,
      turnStartedAt: nowMs,
    };
  }

  if (channel.phase === "closing") {
    return {
      ...channel,
      status: "voting",
      phase: "voting",
      activeSpeakerId: undefined,
      phaseStartedAt: nowMs,
      phaseEndsAt: undefined,
      turnStartedAt: undefined,
    };
  }

  return channel;
};

const passDebateTurn = (channel: DebateChannel, nowMs = Date.now()): DebateChannel => {
  if (channel.phase !== "crossfire" || !channel.activeSpeakerId) return channel;
  const nextSpeakerId = channel.participantIds.find((participantId) => participantId !== channel.activeSpeakerId);
  if (!nextSpeakerId) return channel;
  const remainingSecondsByUser = captureCrossfireClock(channel, nowMs);

  return {
    ...channel,
    activeSpeakerId: nextSpeakerId,
    turnStartedAt: nowMs,
    remainingSecondsByUser,
  };
};

const seedUsers: User[] = [
  {
    id: "u_admin",
    loginId: "nosu",
    password: "demo",
    authProvider: "local",
    phone: "010-0000-2026",
    phoneVerified: true,
    displayName: "노수",
    title: "메인 운영자 / 토론 기획자",
    bio: "논쟁이 콘텐츠가 되는 커뮤니티를 실험 중입니다. 좋은 주제, 명확한 룰, 깔끔한 판정을 중요하게 봅니다.",
    photoUrl: "",
    role: "admin",
    coins: 1200,
    accentColor: "blue",
    profileFrame: "glow",
    bannerStyle: "gradient",
    featuredBadge: "운영자 인증",
    ownedItemIds: ["badge_logic", "profile_glow"],
    claims: [
      { id: "c_admin_1", label: "운영 권한", value: "플랫폼 메인 운영자", status: "verified" },
      { id: "c_admin_2", label: "관심 분야", value: "정책, 기술, 커뮤니티 설계", status: "self_reported" },
    ],
    stats: { wins: 3, losses: 1, aiRating: 86, voteTrust: 92 },
  },
  {
    id: "u_seojun",
    loginId: "seojun",
    password: "demo",
    authProvider: "google",
    phone: "010-1111-2026",
    phoneVerified: true,
    displayName: "한서준",
    title: "정책 토론러",
    bio: "제도 설계와 노동시장 이슈를 주로 다룹니다. 주장보다 근거가 오래 남는다고 믿습니다.",
    photoUrl: "",
    role: "member",
    coins: 860,
    accentColor: "mint",
    profileFrame: "solid",
    bannerStyle: "plain",
    featuredBadge: "정책 토론 12승",
    ownedItemIds: ["badge_logic"],
    claims: [
      { id: "c_seojun_1", label: "학력", value: "서울대학교 정치외교학부", status: "verified" },
      { id: "c_seojun_2", label: "경력", value: "전 국회 보좌진", status: "pending" },
    ],
    stats: { wins: 12, losses: 5, aiRating: 91, voteTrust: 84 },
  },
  {
    id: "u_jia",
    loginId: "jia",
    password: "demo",
    authProvider: "kakao",
    phone: "010-2222-2026",
    phoneVerified: true,
    displayName: "민지아",
    title: "AI 제품 PM",
    bio: "기술이 사회적 비용과 편익을 어떻게 바꾸는지 토론합니다. 반례 찾기를 좋아합니다.",
    photoUrl: "",
    role: "moderator",
    coins: 990,
    accentColor: "violet",
    profileFrame: "glow",
    bannerStyle: "midnight",
    featuredBadge: "AI 제품 PM",
    ownedItemIds: ["profile_glow", "badge_counter"],
    claims: [
      { id: "c_jia_1", label: "학력", value: "KAIST 전산학부", status: "verified" },
      { id: "c_jia_2", label: "직업", value: "AI 스타트업 PM", status: "verified" },
    ],
    stats: { wins: 18, losses: 7, aiRating: 88, voteTrust: 89 },
  },
  {
    id: "u_yeonwoo",
    loginId: "yeonwoo",
    password: "demo",
    authProvider: "naver",
    phone: "010-3333-2026",
    phoneVerified: true,
    displayName: "정연우",
    title: "법률 쟁점 전문 토론러",
    bio: "규제와 권리 충돌을 주로 다룹니다. 토론 중 정의를 먼저 맞추는 편입니다.",
    photoUrl: "",
    role: "member",
    coins: 730,
    accentColor: "amber",
    profileFrame: "clean",
    bannerStyle: "gradient",
    featuredBadge: "법률 쟁점",
    ownedItemIds: [],
    claims: [
      { id: "c_yeonwoo_1", label: "직업", value: "변호사", status: "pending" },
      { id: "c_yeonwoo_2", label: "전문 분야", value: "플랫폼 규제", status: "self_reported" },
    ],
    stats: { wins: 8, losses: 8, aiRating: 79, voteTrust: 76 },
  },
];

const seedRooms: Room[] = [
  {
    id: "r_ai_labor",
    title: "AI와 노동시장",
    topic: "생성형 AI가 일자리를 대체하는가, 아니면 새로운 기회를 만드는가?",
    createdBy: "u_admin",
    createdAt: "06.07 00:10",
  },
  {
    id: "r_real_estate",
    title: "부동산 정책",
    topic: "규제 완화와 공급 확대 중 어느 쪽이 주거 안정에 더 효과적인가?",
    createdBy: "u_admin",
    createdAt: "06.07 00:12",
  },
  {
    id: "r_education",
    title: "입시와 공정성",
    topic: "정시 확대가 공정성을 높이는가, 교육 격차를 더 키우는가?",
    createdBy: "u_jia",
    createdAt: "06.07 00:14",
  },
];

const seedChannels: DebateChannel[] = [
  {
    id: "d_ai_public",
    roomId: "r_ai_labor",
    title: "AI 대체론 vs 보완론",
    visibility: "public",
    format: "text",
    status: "live",
    phase: "crossfire",
    createdBy: "u_seojun",
    participantLimit: 2,
    participantIds: ["u_seojun", "u_jia"],
    readyUserIds: ["u_seojun", "u_jia"],
    participantSnapshots: {
      u_seojun: snapshotUser(seedUsers[1]),
      u_jia: snapshotUser(seedUsers[2]),
    },
    stanceByUser: { u_seojun: "agree", u_jia: "disagree" },
    activeSpeakerId: "u_seojun",
    phaseStartedAt: Date.now(),
    turnStartedAt: Date.now(),
    remainingSecondsByUser: { u_seojun: CROSSFIRE_SECONDS, u_jia: CROSSFIRE_SECONDS },
    voiceStateByUser: {
      u_seojun: { muted: false, handRaised: false, updatedAt: "00:18" },
      u_jia: { muted: true, handRaised: true, updatedAt: "00:19" },
    },
    spectatorIds: ["u_admin", "u_yeonwoo"],
    debateMessages: [
      {
        id: "m_1",
        authorId: "u_seojun",
        body: "AI는 단순 업무부터 빠르게 대체합니다. 이미 고객센터, 번역, 초안 작성 업무는 인력 수요가 줄고 있습니다.",
        createdAt: "00:18",
      },
      {
        id: "m_2",
        authorId: "u_jia",
        body: "하지만 대체만 보면 반쪽입니다. 생산성이 오르면 새로운 서비스와 직무가 생깁니다. 핵심은 전환 교육 속도입니다.",
        createdAt: "00:19",
      },
      {
        id: "m_3",
        authorId: "u_seojun",
        body: "전환 교육이 가능하다는 주장에는 동의하지만, 중장년 노동자의 전환 비용과 기간을 어떻게 줄일지 근거가 필요합니다.",
        createdAt: "00:21",
      },
    ],
    spectatorMessages: [
      { id: "s_1", authorId: "u_admin", body: "근거 싸움이 좋아지고 있네요.", createdAt: "00:22" },
      { id: "s_2", authorId: "u_yeonwoo", body: "전환 비용 질문이 핵심 같습니다.", createdAt: "00:23" },
    ],
    votes: [],
    reactions: [
      { id: "react_1", spectatorId: "u_admin", targetUserId: "u_jia", createdAt: "00:24" },
      { id: "react_2", spectatorId: "u_yeonwoo", targetUserId: "u_seojun", createdAt: "00:24" },
    ],
    coinStake: 80,
    createdAt: "06.07 00:16",
  },
  {
    id: "d_ai_private",
    roomId: "r_ai_labor",
    title: "비공개 초청 토론: 기본소득",
    visibility: "private",
    inviteCode: "NB-2046",
    format: "voice",
    status: "waiting",
    phase: "ready",
    createdBy: "u_yeonwoo",
    participantLimit: 2,
    participantIds: ["u_yeonwoo"],
    readyUserIds: [],
    participantSnapshots: {
      u_yeonwoo: snapshotUser(seedUsers[3]),
    },
    stanceByUser: { u_yeonwoo: "agree" },
    remainingSecondsByUser: { u_yeonwoo: CROSSFIRE_SECONDS },
    voiceStateByUser: {
      u_yeonwoo: { muted: true, handRaised: false, updatedAt: "00:24" },
    },
    spectatorIds: [],
    debateMessages: [],
    spectatorMessages: [],
    votes: [],
    reactions: [],
    coinStake: 120,
    createdAt: "06.07 00:24",
  },
];

const initialState: AppState = {
  users: seedUsers,
  rooms: seedRooms,
  channels: seedChannels,
  ledger: [
    {
      id: "l_1",
      type: "signup",
      userId: "u_admin",
      amount: 1000,
      memo: "운영자 초기 코인",
      createdAt: "06.07 00:00",
    },
    {
      id: "l_2",
      type: "signup",
      userId: "u_seojun",
      amount: 500,
      memo: "가입 보너스",
      createdAt: "06.07 00:01",
    },
    {
      id: "l_3",
      type: "signup",
      userId: "u_jia",
      amount: 500,
      memo: "가입 보너스",
      createdAt: "06.07 00:02",
    },
  ],
  reports: [],
  aiAppeals: [],
  sanctions: [],
  notifications: [],
  privacyRequests: [],
  auditLogs: [],
  serviceNotice: null,
  platformSettings: defaultPlatformSettings,
  currentUserId: null,
};

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as AppState;
    if (!parsed.users?.length || !parsed.rooms?.length) return initialState;
    return normalizeAppState(parsed);
  } catch {
    return initialState;
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "offline" | "saving">("checking");
  const [backendStorage, setBackendStorage] = useState<"supabase" | "file" | null>(null);
  const [publicStatus, setPublicStatus] = useState<PublicServiceStatus | null>(null);
  const [publicStatusError, setPublicStatusError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [judgingChannelId, setJudgingChannelId] = useState<string | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const initialRoute = useMemo(() => parseAppRouteHash(window.location.hash), []);
  const initialRouteChannel = initialRoute.channelId
    ? state.channels.find((channel) => channel.id === initialRoute.channelId)
    : undefined;
  const initialRouteRoomId =
    initialRouteChannel?.roomId ??
    (initialRoute.roomId && state.rooms.some((room) => room.id === initialRoute.roomId)
      ? initialRoute.roomId
      : undefined);
  const [view, setView] = useState<ViewKey>(initialRoute.view ?? "arena");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState(initialRouteRoomId ?? state.rooms[0]?.id ?? "");
  const [selectedChannelId, setSelectedChannelId] = useState(
    initialRouteChannel?.id ??
      (initialRouteRoomId ? state.channels.find((channel) => channel.roomId === initialRouteRoomId)?.id : undefined) ??
      state.channels[0]?.id ??
      "",
  );
  const socketRef = useRef<Socket | null>(null);
  const skipNextRemoteSaveRef = useRef(false);
  const oauthCompletingRef = useRef(false);

  const replaceStateFromServer = (
    nextState: AppState,
    options: { preserveCurrentUser?: boolean } = {},
  ) => {
    const normalized = normalizeAppState(nextState);
    skipNextRemoteSaveRef.current = true;
    setState((current) => ({
      ...normalized,
      currentUserId: options.preserveCurrentUser ? current.currentUserId : normalized.currentUserId,
    }));
    setSelectedRoomId((currentRoomId) =>
      normalized.rooms.some((room) => room.id === currentRoomId) ? currentRoomId : (normalized.rooms[0]?.id ?? ""),
    );
    setSelectedChannelId((currentChannelId) =>
      normalized.channels.some((channel) => channel.id === currentChannelId)
        ? currentChannelId
        : (normalized.channels[0]?.id ?? ""),
    );
  };

  const jsonHeaders = (): HeadersInit => ({
    "Content-Type": "application/json; charset=utf-8",
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  });

  const updateCsrfToken = (nextToken?: string | null) => {
    if (nextToken) setCsrfToken(nextToken);
  };

  useEffect(() => {
    if (backendStatus === "connected") {
      setLastSuccessfulSyncAt(new Date().toISOString());
      setConnectionNotice("");
    }
    if (backendStatus === "offline") {
      setConnectionNotice("API 요청에 실패했습니다. 서버가 꺼졌거나 네트워크 연결이 끊겼을 수 있습니다.");
    }
  }, [backendStatus]);

  const refreshPublicStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as PublicServiceStatus;
      if (!payload?.service || !payload.status || !payload.checkedAt) {
        throw new Error("invalid status payload");
      }
      setPublicStatus(payload);
      setPublicStatusError(response.ok ? "" : payload.label || "서비스 상태 확인 필요");
      setBackendStorage(payload.storage?.storage ?? null);
    } catch {
      setPublicStatus(null);
      setPublicStatusError("운영 상태를 불러오지 못했습니다.");
    }
  };

  const refreshCurrentSession = async (): Promise<SessionCheckResult> => {
    try {
      setBackendStatus("checking");
      const response = await fetch(`${API_BASE}/auth/session`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as AuthSessionPayload;
      if (!response.ok || payload.ok === false) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? "세션 확인에 실패했습니다.",
          checkedAt: new Date().toISOString(),
        };
      }
      updateCsrfToken(payload.csrfToken);
      if (!payload.authenticated) {
        setCsrfToken("");
        setState((previous) => ({ ...previous, currentUserId: null }));
      }
      setRemoteReady(true);
      setBackendStatus("connected");
      return {
        ok: true,
        authenticated: Boolean(payload.authenticated),
        userId: payload.userId ?? payload.user?.id,
        displayName: payload.user?.displayName,
        role: payload.user?.role,
        authProvider: payload.user?.authProvider,
        phoneVerified: payload.user?.phoneVerified,
        agreementsAccepted: Boolean(payload.authenticated && normalizeAgreementState(payload.user?.agreements).requiredAccepted),
        expiresAt: payload.session?.expiresAt,
        expiresInSeconds: payload.session?.expiresInSeconds,
        sameSite: payload.session?.sameSite,
        secure: payload.session?.secure,
        reason: payload.reason,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "세션 API에 연결할 수 없습니다.", checkedAt: new Date().toISOString() };
    }
  };

  const selectArenaChannel = (roomId: string, channelId: string) => {
    setView("arena");
    setSelectedRoomId(roomId);
    setSelectedChannelId(channelId);
    const nextHash = buildAppRouteHash("arena", roomId, channelId);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  };

  const runAuthAction = async (
    path: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<AuthResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? fallbackMessage,
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state);
      }
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "백엔드 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const completeSupabaseOAuthSession = async (): Promise<AuthResult> => {
    if (!supabaseAuth || oauthCompletingRef.current) return { ok: false, message: "Supabase OAuth가 설정되지 않았습니다." };
    oauthCompletingRef.current = true;
    try {
      setBackendStatus("saving");
      const { data, error } = await supabaseAuth.auth.getSession();
      if (error || !data.session?.access_token) {
        setBackendStatus("connected");
        return { ok: false, message: "간편 로그인 세션을 찾을 수 없습니다." };
      }
      const response = await fetch(`${API_BASE}/auth/oauth/session`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({
          accessToken: data.session.access_token,
          provider: data.session.user.app_metadata?.provider,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? "간편 로그인 세션 연결에 실패했습니다.",
        };
      }
      if (payload.state) replaceStateFromServer(payload.state);
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "간편 로그인 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    } finally {
      oauthCompletingRef.current = false;
    }
  };

  const loginWithPassword = (nextLoginId: string, nextPassword: string) =>
    runAuthAction(
      "/auth/login",
      { loginId: nextLoginId, password: nextPassword },
      "로그인에 실패했습니다.",
    );

  const signupWithPassword = (payload: SignupPayload) =>
    runAuthAction("/auth/signup", payload, "계정 생성에 실패했습니다.");

  const requestPasswordResetCode = async (loginId: string, phone: string): Promise<PhoneCodeResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/auth/password-reset/request-code`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ loginId, phone }),
      });
      const payload = (await response.json().catch(() => ({}))) as PhoneCodeResult & { error?: string };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? "비밀번호 재설정 인증번호 요청에 실패했습니다.",
          resendAfterSeconds: payload.resendAfterSeconds,
        };
      }
      setBackendStatus("connected");
      return { ...payload, ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "비밀번호 재설정 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const confirmPasswordReset = (loginId: string, phone: string, code: string, newPassword: string) =>
    runAuthAction(
      "/auth/password-reset/confirm",
      { loginId, phone, code, newPassword },
      "비밀번호 재설정에 실패했습니다.",
    );

  const loginWithProvider = async (provider: Exclude<Provider, "local">): Promise<AuthResult> => {
    setAuthNotice("");
    if (!supabaseAuth) {
      return runAuthAction("/auth/social", { provider }, "간편 로그인에 실패했습니다.");
    }
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: provider as never,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) return { ok: false, message: error.message || "간편 로그인 시작에 실패했습니다." };
    return { ok: true };
  };

  useEffect(() => {
    if (!supabaseAuth || !remoteReady || state.currentUserId || oauthCompletingRef.current) return;
    const urlLooksLikeOAuthCallback = hasOAuthCallbackParams(window.location.hash, window.location.search);
    supabaseAuth.auth.getSession().then(({ data }) => {
      if (!data.session?.access_token) return;
      if (!urlLooksLikeOAuthCallback && !data.session.user?.app_metadata?.provider) return;
      void completeSupabaseOAuthSession().then((result) => {
        if (!result.ok) setAuthNotice(result.message ?? "간편 로그인 완료에 실패했습니다.");
      });
    });
  }, [remoteReady, state.currentUserId]);

  const selectDemoUser = (userId: string) =>
    runAuthAction("/auth/select-demo", { userId }, "데모 계정 전환에 실패했습니다.");

  const logout = async () => {
    try {
      if (supabaseAuth) await supabaseAuth.auth.signOut();
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include", headers: jsonHeaders() });
    } finally {
      setState((previous) => ({ ...previous, currentUserId: null }));
      setCsrfToken("");
      setNotificationsOpen(false);
    }
  };

  const runChannelAction = async (
    path: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<ChannelActionResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? fallbackMessage,
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      }
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true, channelId: payload.channelId, roomId: payload.roomId };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "채널 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const runDebateAction = async (
    path: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<ChannelActionResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? fallbackMessage,
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      }
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true, channelId: payload.channelId, roomId: payload.roomId };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "토론 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const runAdminAction = async (
    path: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<ChannelActionResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? fallbackMessage,
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      }
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true, channelId: payload.channelId, roomId: payload.roomId };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "운영 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const runUserAction = async (
    path: string,
    body: unknown,
    fallbackMessage: string,
  ): Promise<ActionResult> => {
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? fallbackMessage,
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      }
      updateCsrfToken(payload.csrfToken);
      setRemoteReady(true);
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "유저 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  useEffect(() => {
    void refreshPublicStatus();
    const timer = window.setInterval(() => {
      void refreshPublicStatus();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    const loadRemoteState = async () => {
      try {
        const healthResponse = await fetch(`${API_BASE}/health`, { credentials: "include" });
        if (healthResponse.ok) {
          const health = (await healthResponse.json()) as { storage?: "supabase" | "file" };
          setBackendStorage(health.storage ?? null);
        }
        const response = await fetch(`${API_BASE}/state`, { credentials: "include" });
        if (!response.ok) throw new Error("state fetch failed");
        const payload = (await response.json()) as ApiStatePayload;
        if (cancelled) return;
        if (payload.state) {
          replaceStateFromServer(payload.state);
          updateCsrfToken(payload.csrfToken);
        } else {
          await fetch(`${API_BASE}/state`, {
            method: "PUT",
            credentials: "include",
            headers: jsonHeaders(),
            body: JSON.stringify({ state }),
          });
        }
        setBackendStatus("connected");
      } catch {
        if (!cancelled) setBackendStatus("offline");
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    };

    loadRemoteState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = io({
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    const markRealtimeReconnecting = () => setRealtimeStatus("connecting");

    socket.on("connect", () => {
      setRealtimeStatus("live");
    });
    socket.on("disconnect", () => {
      setRealtimeStatus("offline");
    });
    socket.on("connect_error", () => {
      setRealtimeStatus("offline");
    });
    socket.on("server-ready", (payload: { storage?: "supabase" | "file" }) => {
      setRealtimeStatus("live");
      setBackendStorage(payload.storage ?? null);
    });
    socket.on("state-updated", (payload: StateUpdatedPayload) => {
      if (payload.storage) setBackendStorage(payload.storage);
      setBackendStatus("connected");
      replaceStateFromServer(payload.state, { preserveCurrentUser: true });
    });
    socket.on("state-reset", () => {
      setRealtimeStatus("live");
    });
    socket.io.on("reconnect_attempt", markRealtimeReconnecting);

    return () => {
      socket.io.off("reconnect_attempt", markRealtimeReconnecting);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [state.currentUserId]);

  useEffect(() => {
    const activeChannel = state.channels.find((channel) => channel.id === selectedChannelId);
    if (activeChannel && activeChannel.roomId !== selectedRoomId) {
      setSelectedRoomId(activeChannel.roomId);
    }
  }, [selectedChannelId, selectedRoomId, state.channels]);

  useEffect(() => {
    const applyRouteFromHash = () => {
      if (hasOAuthCallbackParams(window.location.hash, window.location.search)) return;

      const route = parseAppRouteHash(window.location.hash);
      if (route.view) setView(route.view);

      if (route.channelId) {
        const routeChannel = state.channels.find((channel) => channel.id === route.channelId);
        if (routeChannel) {
          setSelectedRoomId(routeChannel.roomId);
          setSelectedChannelId(routeChannel.id);
          return;
        }
      }

      if (route.roomId) {
        const routeRoom = state.rooms.find((room) => room.id === route.roomId);
        if (!routeRoom) return;
        setSelectedRoomId(routeRoom.id);
        setSelectedChannelId((currentChannelId) => {
          const currentChannel = state.channels.find((channel) => channel.id === currentChannelId);
          if (currentChannel?.roomId === routeRoom.id) return currentChannelId;
          return state.channels.find((channel) => channel.roomId === routeRoom.id)?.id ?? "";
        });
      }
    };

    applyRouteFromHash();
    window.addEventListener("hashchange", applyRouteFromHash);
    return () => window.removeEventListener("hashchange", applyRouteFromHash);
  }, [state.channels, state.rooms]);

  const activeUsers = state.users.filter(isActiveUser);
  const currentUser = activeUsers.find((user) => user.id === state.currentUserId) ?? null;
  const selectedRoom = state.rooms.find((room) => room.id === selectedRoomId) ?? state.rooms[0];
  const selectedChannel =
    state.channels.find((channel) => channel.id === selectedChannelId) ??
    state.channels.find((channel) => channel.roomId === selectedRoom?.id) ??
    null;
  const currentUserNotifications = currentUser
    ? state.notifications.filter((notification) => notification.userId === currentUser.id)
    : [];
  const unreadNotificationCount = currentUserNotifications.filter((notification) => !notification.readAt).length;

  useEffect(() => {
    if (!currentUser) return;
    if (hasOAuthCallbackParams(window.location.hash, window.location.search)) return;

    const nextHash = buildAppRouteHash(view, selectedRoom?.id, selectedChannel?.id);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, [currentUser, selectedChannel?.id, selectedRoom?.id, view]);

  const acceptRequiredAgreements = async (): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/auth/agreements/accept`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload & {
        agreements?: UserAgreementState;
      };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? "필수 약관 동의 저장에 실패했습니다.",
        };
      }
      if (payload.state) replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      updateCsrfToken(payload.csrfToken);
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "약관 동의 API에 연결할 수 없습니다. 서버 상태를 확인해주세요." };
    }
  };

  const requestCurrentUserPhoneCode = async (phone: string): Promise<PhoneCodeResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/auth/phone/request-code`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ userId: currentUser.id, phone }),
      });
      const payload = (await response.json().catch(() => ({}))) as PhoneCodeResult & { error?: string };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: authErrorMessages[payload.error ?? ""] ?? "인증번호 요청에 실패했습니다.",
          resendAfterSeconds: payload.resendAfterSeconds,
        };
      }
      setBackendStatus("connected");
      return { ...payload, ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "인증번호 요청 API에 연결할 수 없습니다. 서버를 확인해주세요." };
    }
  };

  const verifyCurrentUserPhone = (phone: string, code: string) =>
    runAuthAction(
      "/auth/phone/verify",
      { userId: currentUser?.id, phone, code },
      "전화번호 인증에 실패했습니다.",
    );

  const changeCurrentUserPhone = (phone: string) =>
    runAuthAction(
      "/auth/phone/change",
      { userId: currentUser?.id, phone },
      "전화번호 변경에 실패했습니다.",
    );

  const changeCurrentUserPassword = (currentPassword: string, newPassword: string) =>
    runAuthAction(
      "/auth/password",
      { userId: currentUser?.id, currentPassword, newPassword },
      "비밀번호 변경에 실패했습니다.",
    );

  const deactivateCurrentUser = async (password: string, confirmation: string, reason: string): Promise<AuthResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    const result = await runAuthAction(
      "/auth/account/deactivate",
      { userId: currentUser.id, password, confirmation, reason },
      "계정 탈퇴 처리에 실패했습니다.",
    );
    if (result.ok) {
      setCsrfToken("");
      setNotificationsOpen(false);
    }
    return result;
  };

  const exportCurrentUserData = async (): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/users/${currentUser.id}/data-export`, {
        credentials: "include",
        headers: jsonHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; filename?: string } & Record<string, unknown>;
      if (!response.ok || !payload.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? "내 데이터 다운로드에 실패했습니다.",
        };
      }
      const filename = payload.filename || `nosu-best-user-data-${currentUser.id}-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "내 데이터 export API에 연결할 수 없습니다." };
    }
  };

  const requestPrivacyDeletion = (reason: string): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      `/users/${currentUser.id}/privacy/delete-request`,
      { userId: currentUser.id, reason },
      "개인정보 삭제 요청 접수에 실패했습니다.",
    );
  };

  const markNotificationRead = (notificationId: string): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      `/notifications/${notificationId}/read`,
      { userId: currentUser.id },
      "알림 읽음 처리에 실패했습니다.",
    );
  };

  const markAllNotificationsRead = (): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      "/notifications/read-all",
      { userId: currentUser.id },
      "알림 읽음 처리에 실패했습니다.",
    );
  };

  const openNotification = (notification: UserNotification) => {
    if (!notification.readAt) {
      void markNotificationRead(notification.id);
    }
    const linkedChannel = notification.channelId
      ? state.channels.find((channel) => channel.id === notification.channelId)
      : undefined;
    const linkedRoomId = notification.roomId ?? linkedChannel?.roomId;
    if (notification.view === "arena" || (!notification.view && linkedRoomId)) {
      setView("arena");
      if (linkedRoomId) setSelectedRoomId(linkedRoomId);
      if (notification.channelId) setSelectedChannelId(notification.channelId);
    } else if (notification.view) {
      setView(notification.view);
      if (linkedRoomId) setSelectedRoomId(linkedRoomId);
      if (notification.channelId) setSelectedChannelId(notification.channelId);
    }
    setNotificationsOpen(false);
  };

  const resetDemo = async () => {
    localStorage.removeItem(STORAGE_KEY);
    try {
      await fetch(`${API_BASE}/state`, { method: "DELETE", credentials: "include", headers: jsonHeaders() });
      await fetch(`${API_BASE}/state`, {
        method: "PUT",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ state: initialState }),
      });
      setBackendStatus("connected");
    } catch {
      setBackendStatus("offline");
    }
    setState(initialState);
    setView("arena");
    setSelectedRoomId(initialState.rooms[0].id);
    setSelectedChannelId(initialState.channels[0].id);
  };

  const updateUser = (userId: string, updater: (user: User) => User) => {
    setState((previous) => ({
      ...previous,
      users: previous.users.map((user) => (user.id === userId ? updater(user) : user)),
    }));
  };

  const createUser = (user: User) => {
    setState((previous) => ({
      ...previous,
      users: [...previous.users, user],
      ledger: [
        ...previous.ledger,
        {
          id: uid("ledger"),
          type: "signup",
          userId: user.id,
          amount: 500,
          memo: "가입 보너스",
          createdAt: nowLabel(),
        },
      ],
      currentUserId: user.id,
    }));
  };

  const loginAs = (userId: string) => {
    void selectDemoUser(userId);
  };

  const createRoom = (title: string, topic: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      "/admin/rooms",
      { actorId: currentUser.id, title, topic },
      "주제 방 생성에 실패했습니다.",
    ).then((result) => {
      if (result.ok && result.roomId) {
        setSelectedRoomId(result.roomId);
        setSelectedChannelId("");
      }
      return result;
    });
  };

  const updateRoom = (roomId: string, title: string, topic: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/rooms/${roomId}/update`,
      { actorId: currentUser.id, title, topic },
      "주제 방 수정에 실패했습니다.",
    );
  };

  const deleteRoom = (roomId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/rooms/${roomId}/delete`,
      { actorId: currentUser.id },
      "주제 방 삭제에 실패했습니다.",
    ).then((result) => {
      if (result.ok && selectedRoomId === roomId) {
        const fallbackRoom = state.rooms.find((room) => room.id !== roomId);
        const fallbackChannel = fallbackRoom
          ? state.channels.find((channel) => channel.roomId === fallbackRoom.id)
          : undefined;
        setSelectedRoomId(fallbackRoom?.id ?? "");
        setSelectedChannelId(fallbackChannel?.id ?? "");
      }
      if (result.ok && selectedChannel?.roomId === roomId) {
        setSelectedChannelId("");
      }
      return result;
    });
  };

  const checkStorage = async (): Promise<StorageCheckResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/storage-check`, {
        credentials: "include",
        headers: jsonHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as StorageCheckResult & { error?: string };
      if (!response.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "저장소 점검에 실패했습니다.");
      }
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("저장소 점검 API에 연결할 수 없습니다.");
    }
  };

  const exportStateBackup = async (): Promise<StateExportResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/state-export`, {
        credentials: "include",
        headers: jsonHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as StateExportResult & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "상태 백업 다운로드에 실패했습니다.");
      }
      const filename = payload.filename || `nosu-best-state-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("상태 백업 API에 연결할 수 없습니다.");
    }
  };

  const exportSecureStateBackup = async (confirmation: string): Promise<SecureStateExportResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/state-export/secure`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ confirmation }),
      });
      const payload = (await response.json().catch(() => ({}))) as SecureStateExportResult & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "보안 백업 다운로드에 실패했습니다.");
      }
      const filename = payload.filename || `nosu-best-secure-state-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("보안 백업 API에 연결할 수 없습니다.");
    }
  };

  const exportAuditLogs = async (filters?: AuditLogFilter): Promise<AuditExportResult> => {
    setBackendStatus("saving");
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters ?? {}).forEach(([key, value]) => {
        if (value) queryParams.set(key, value);
      });
      const query = queryParams.toString();
      const response = await fetch(`${API_BASE}/admin/audit-export${query ? `?${query}` : ""}`, {
        credentials: "include",
        headers: jsonHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as AuditExportResult & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "감사 로그 다운로드에 실패했습니다.");
      }
      const jsonFilename = payload.filename || `nosu-best-audit-${new Date().toISOString().slice(0, 10)}.json`;
      const csvFilename = payload.csvFilename || jsonFilename.replace(/\.json$/i, ".csv");
      [
        { filename: jsonFilename, text: JSON.stringify(payload, null, 2), type: "application/json" },
        { filename: csvFilename, text: payload.csv ?? "", type: "text/csv;charset=utf-8" },
      ].forEach((file) => {
        const blob = new Blob([file.text], { type: file.type });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      });
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("감사 로그 API에 연결할 수 없습니다.");
    }
  };

  const validateStateBackup = async (backup: unknown): Promise<StateBackupValidationResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/state-export/validate`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ backup }),
      });
      const payload = (await response.json().catch(() => ({}))) as StateBackupValidationResult & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "백업 파일 점검에 실패했습니다.");
      }
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("백업 파일 점검 API에 연결할 수 없습니다.");
    }
  };

  const restoreStateBackup = async (backup: unknown, confirmation: string): Promise<StorageRestoreResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/state-restore`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ backup, confirmation }),
      });
      const payload = (await response.json().catch(() => ({}))) as StorageRestoreResult & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "백업 복구에 실패했습니다.");
      }
      if (payload.state) {
        setState(payload.state);
        const firstRoomId = payload.state.rooms[0]?.id ?? "";
        setSelectedRoomId(firstRoomId);
        setSelectedChannelId(payload.state.channels.find((channel) => channel.roomId === firstRoomId)?.id ?? "");
      }
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("백업 복구 API에 연결할 수 없습니다.");
    }
  };

  const checkReadiness = async (): Promise<OperationalReadinessResult> => {
    setBackendStatus("saving");
    try {
      const response = await fetch(`${API_BASE}/admin/readiness`, {
        credentials: "include",
        headers: jsonHeaders(),
      });
      const payload = (await response.json().catch(() => ({}))) as OperationalReadinessResult & { error?: string };
      if (!response.ok) {
        throw new Error(channelErrorMessages[payload.error ?? ""] ?? "운영 준비도 점검에 실패했습니다.");
      }
      setBackendStatus("connected");
      return payload;
    } catch (error) {
      setBackendStatus("offline");
      throw error instanceof Error ? error : new Error("운영 준비도 점검 API에 연결할 수 없습니다.");
    }
  };

  const syncNormalizedStorage = async (): Promise<StorageSyncResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/admin/sync-normalized`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ actorId: currentUser.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as StorageSyncResult & { error?: string };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? "정규 테이블 동기화에 실패했습니다.",
        };
      }
      setBackendStatus("connected");
      return { ...payload, ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "정규 테이블 동기화 API에 연결할 수 없습니다." };
    }
  };

  const seedDemoStorage = async (): Promise<StorageSyncResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/admin/seed-demo-state`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ actorId: currentUser.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as StorageSyncResult & { error?: string };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? "데모 상태 복구에 실패했습니다.",
        };
      }
      if (payload.state) {
        replaceStateFromServer(payload.state, { preserveCurrentUser: true });
        const firstRoomId = payload.state.rooms[0]?.id ?? "";
        setSelectedRoomId(firstRoomId);
        setSelectedChannelId(payload.state.channels.find((channel) => channel.roomId === firstRoomId)?.id ?? "");
      }
      setBackendStatus("connected");
      return { ...payload, ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "데모 상태 복구 API에 연결할 수 없습니다." };
    }
  };

  const updateServiceNotice = async (
    notice: Pick<ServiceNotice, "title" | "body" | "tone" | "active"> & { expiresAt?: string | null },
  ): Promise<ServiceNoticeUpdateResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/admin/service-notice`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ actorId: currentUser.id, ...notice }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload & {
        serviceNotice?: ServiceNotice | null;
        error?: string;
      };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? "운영 공지 저장에 실패했습니다.",
        };
      }
      if (payload.state) replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      void refreshPublicStatus();
      setBackendStatus("connected");
      return {
        ok: true,
        serviceNotice: payload.serviceNotice ?? payload.state?.serviceNotice ?? null,
        state: payload.state ?? undefined,
      };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "운영 공지 API에 연결할 수 없습니다." };
    }
  };

  const updatePlatformSettings = async (platformSettings: PlatformSettings): Promise<PlatformSettingsUpdateResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/admin/platform-settings`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ actorId: currentUser.id, platformSettings }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload & {
        platformSettings?: PlatformSettings;
        error?: string;
      };
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? "운영 정책 설정 저장에 실패했습니다.",
        };
      }
      if (payload.state) replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      setBackendStatus("connected");
      return {
        ok: true,
        platformSettings: payload.platformSettings ?? payload.state?.platformSettings,
        state: payload.state ?? undefined,
      };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "운영 정책 설정 API에 연결할 수 없습니다." };
    }
  };

  const saveUserProfile = (nextUser: User): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      `/users/${currentUser.id}/profile`,
      {
        actorId: currentUser.id,
        profile: {
          displayName: nextUser.displayName,
          title: nextUser.title,
          bio: nextUser.bio,
          photoUrl: nextUser.photoUrl,
          accentColor: nextUser.accentColor,
          profileFrame: nextUser.profileFrame,
          bannerStyle: nextUser.bannerStyle,
          featuredBadge: nextUser.featuredBadge,
          claims: nextUser.claims,
        },
      },
      "프로필 저장에 실패했습니다.",
    );
  };

  const purchaseShopItem = (itemId: string): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      "/shop/purchase",
      { userId: currentUser.id, itemId },
      "상점 구매에 실패했습니다.",
    );
  };

  const adjustUserCoins = (userId: string, amount: number, reason: string): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/users/${userId}/coins`,
      { actorId: currentUser.id, amount, reason },
      "코인 수동 조정에 실패했습니다.",
    );
  };

  const requestClaimVerification = (
    claimId: string,
    reason: string,
    evidenceText: string,
    evidenceUrl: string,
  ): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      `/users/${currentUser.id}/claims/${claimId}/request-verification`,
      { actorId: currentUser.id, reason, evidenceText, evidenceUrl },
      "인증 요청에 실패했습니다.",
    );
  };

  const blockedBySuspension = (): ChannelActionResult | null => {
    const activeSuspension = currentUser ? getActiveSuspension(state, currentUser.id) : undefined;
    return activeSuspension ? { ok: false, message: suspensionActionMessage(activeSuspension) } : null;
  };

  const createChannel = (
    roomId: string,
    title: string,
    visibility: ChannelVisibility,
    format: DebateFormat,
    coinStake: number,
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runChannelAction(
      "/channels",
      { roomId, title, visibility, format, coinStake, userId: currentUser.id },
      "채널 생성에 실패했습니다.",
    ).then((result) => {
      if (result.ok && result.channelId) {
        selectArenaChannel(roomId, result.channelId);
      }
      return result;
    });
  };

  const joinChannel = (channelId: string, user: User): Promise<ChannelActionResult> => {
    const suspensionBlock = user.id === currentUser?.id ? blockedBySuspension() : null;
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runChannelAction(
      `/channels/${channelId}/join`,
      { userId: user.id },
      "채널 참가에 실패했습니다.",
    ).then((result) => {
      if (result.ok) {
        const roomId = result.roomId ?? state.channels.find((channel) => channel.id === channelId)?.roomId;
        if (roomId) selectArenaChannel(roomId, channelId);
      }
      return result;
    });
  };

  const joinChannelByCode = (code: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runChannelAction(
      "/channels/join-code",
      { code, userId: currentUser.id },
      "입장 코드 참가에 실패했습니다.",
    ).then((result) => {
      if (result.ok && result.channelId) {
        const roomId = result.roomId ?? state.channels.find((channel) => channel.id === result.channelId)?.roomId;
        if (roomId) selectArenaChannel(roomId, result.channelId);
      }
      return result;
    });
  };

  const spectateChannel = (channelId: string, userId: string): Promise<ChannelActionResult> => {
    const suspensionBlock = userId === currentUser?.id ? blockedBySuspension() : null;
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runChannelAction(
      `/channels/${channelId}/spectate`,
      { userId },
      "관전 입장에 실패했습니다.",
    ).then((result) => {
      if (result.ok) {
        const roomId = result.roomId ?? state.channels.find((channel) => channel.id === channelId)?.roomId;
        if (roomId) selectArenaChannel(roomId, channelId);
      }
      return result;
    });
  };

  const updateChannelInviteCode = (
    channelId: string,
    action: "regenerate" | "disable",
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runChannelAction(
      `/channels/${channelId}/invite-code`,
      { actorId: currentUser.id, action },
      action === "regenerate" ? "입장 코드 재생성에 실패했습니다." : "입장 코드 비활성화에 실패했습니다.",
    );
  };

  const leaveChannel = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runChannelAction(
      `/channels/${channelId}/leave`,
      { userId: currentUser.id },
      "채널 나가기에 실패했습니다.",
    );
  };

  const startDebate = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/start`,
      { userId: currentUser.id },
      "토론 시작에 실패했습니다.",
    );
  };

  const advanceDebatePhase = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/advance`,
      { userId: currentUser.id },
      "토론 단계 전환에 실패했습니다.",
    );
  };

  const passTurn = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/pass`,
      { userId: currentUser.id },
      "턴 넘기기에 실패했습니다.",
    );
  };

  const setParticipantStance = (
    channelId: string,
    userId: string,
    stance: DebateStance,
  ): Promise<ChannelActionResult> => {
    const suspensionBlock = userId === currentUser?.id ? blockedBySuspension() : null;
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/stance`,
      { userId, stance },
      "스탠스 변경에 실패했습니다.",
    );
  };

  const setParticipantReady = (
    channelId: string,
    userId: string,
    ready: boolean,
  ): Promise<ChannelActionResult> => {
    const suspensionBlock = userId === currentUser?.id ? blockedBySuspension() : null;
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/ready`,
      { userId, ready },
      "준비 상태 변경에 실패했습니다.",
    );
  };

  const setVoiceState = (
    channelId: string,
    userId: string,
    voiceState: Pick<VoiceState, "muted" | "handRaised">,
  ): Promise<ChannelActionResult> => {
    const suspensionBlock = userId === currentUser?.id ? blockedBySuspension() : null;
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/voice`,
      { userId, ...voiceState },
      "마이크 상태 변경에 실패했습니다.",
    );
  };

  const moveToVoting = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/voting`,
      { userId: currentUser.id },
      "투표 단계 전환에 실패했습니다.",
    );
  };

  const addDebateMessage = (channelId: string, body: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/messages`,
      { userId: currentUser.id, body },
      "발언 전송에 실패했습니다.",
    );
  };

  const addSpectatorMessage = (channelId: string, body: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/spectator-messages`,
      { userId: currentUser.id, body },
      "관전 채팅 전송에 실패했습니다.",
    );
  };

  const submitVote = (channelId: string, targetUserId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/votes`,
      { userId: currentUser.id, targetUserId },
      "투표에 실패했습니다.",
    );
  };

  const submitReaction = (channelId: string, targetUserId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      `/debate/${channelId}/reactions`,
      { userId: currentUser.id, targetUserId },
      "공감 저장에 실패했습니다.",
    );
  };

  const submitReport = (
    targetType: ReportTargetType,
    targetId: string,
    channelId: string | undefined,
    reason: string,
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    const suspensionBlock = blockedBySuspension();
    if (suspensionBlock) return Promise.resolve(suspensionBlock);
    return runDebateAction(
      "/reports",
      { userId: currentUser.id, targetType, targetId, channelId, reason },
      "신고 접수에 실패했습니다.",
    );
  };

  const submitAiAppeal = (channelId: string, reason: string): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runUserAction(
      `/debate/${channelId}/appeals`,
      { userId: currentUser.id, reason },
      "AI 판정 이의제기 제출에 실패했습니다.",
    );
  };

  const setUserRole = (userId: string, role: Role): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/users/${userId}/role`,
      { actorId: currentUser.id, role },
      "권한 변경에 실패했습니다.",
    );
  };

  const sanctionUser = (
    userId: string,
    type: SanctionType,
    reason: string,
    durationHours?: number,
    reportId?: string,
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/users/${userId}/sanctions`,
      { actorId: currentUser.id, type, reason, durationHours, reportId },
      "유저 제재 처리에 실패했습니다.",
    );
  };

  const revokeSanction = (sanctionId: string, reason = ""): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/sanctions/${sanctionId}/revoke`,
      { actorId: currentUser.id, reason },
      "제재 해제에 실패했습니다.",
    );
  };

  const verifyUserClaim = (
    userId: string,
    claimId: string,
    status: VerificationStatus = "verified",
    reviewMemo = "",
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/users/${userId}/claims/${claimId}/verify`,
      { actorId: currentUser.id, status, reviewMemo },
      "프로필 인증 처리에 실패했습니다.",
    );
  };

  const resolveReport = (
    reportId: string,
    status: ReportStatus = "resolved",
    reviewMemo = "",
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/reports/${reportId}/resolve`,
      { actorId: currentUser.id, status, reviewMemo },
      "신고 처리에 실패했습니다.",
    );
  };

  const resolveAiAppeal = (
    appealId: string,
    status: AiAppealStatus = "resolved",
    reviewMemo = "",
  ): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/ai-appeals/${appealId}/resolve`,
      { actorId: currentUser.id, status, reviewMemo },
      "AI 판정 이의제기 처리에 실패했습니다.",
    );
  };

  const resolvePrivacyRequest = (
    requestId: string,
    status: PrivacyRequestStatus = "resolved",
    reviewMemo = "",
  ): Promise<ActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/privacy-requests/${requestId}/resolve`,
      { actorId: currentUser.id, status, reviewMemo },
      "개인정보 요청 처리에 실패했습니다.",
    );
  };

  const forceFinishChannel = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/channels/${channelId}/finish`,
      { actorId: currentUser.id },
      "채널 강제 종료에 실패했습니다.",
    );
  };

  const deleteChannel = (channelId: string): Promise<ChannelActionResult> => {
    if (!currentUser) return Promise.resolve({ ok: false, message: "로그인이 필요합니다." });
    return runAdminAction(
      `/admin/channels/${channelId}/delete`,
      { actorId: currentUser.id },
      "채널 삭제에 실패했습니다.",
    ).then((result) => {
      if (result.ok && selectedChannelId === channelId) {
        setSelectedChannelId("");
      }
      return result;
    });
  };

  const finalizeDebate = async (channelId: string): Promise<ActionResult> => {
    if (!currentUser) return { ok: false, message: "로그인이 필요합니다." };
    setJudgingChannelId(channelId);
    try {
      setBackendStatus("saving");
      const response = await fetch(`${API_BASE}/ai/judge`, {
        method: "POST",
        credentials: "include",
        headers: jsonHeaders(),
        body: JSON.stringify({ channelId, userId: currentUser.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiStatePayload;
      if (!response.ok) {
        setBackendStatus("connected");
        return {
          ok: false,
          message: channelErrorMessages[payload.error ?? ""] ?? payload.error ?? "AI 판정에 실패했습니다.",
        };
      }
      if (payload.state) replaceStateFromServer(payload.state, { preserveCurrentUser: true });
      setBackendStatus("connected");
      return { ok: true };
    } catch {
      setBackendStatus("offline");
      return { ok: false, message: "AI 판정 API에 연결할 수 없습니다." };
    } finally {
      setJudgingChannelId(null);
    }
  };

  const retryConnection = async () => {
    setConnectionNotice("");
    setBackendStatus("checking");
    setRealtimeStatus(socketRef.current?.connected ? "live" : "connecting");
    socketRef.current?.connect();
    await Promise.allSettled([refreshPublicStatus(), refreshCurrentSession()]);
  };

  if (!currentUser) {
    return (
      <AuthView
        state={state}
        onLogin={loginWithPassword}
        onSignup={signupWithPassword}
        onRequestPasswordResetCode={requestPasswordResetCode}
        onConfirmPasswordReset={confirmPasswordReset}
        onSocialLogin={loginWithProvider}
        onSelectDemo={selectDemoUser}
        authNotice={authNotice}
        serviceStatus={publicStatus}
        serviceStatusError={publicStatusError}
        onRefreshServiceStatus={refreshPublicStatus}
      />
    );
  }

  if (!hasRequiredAgreements(currentUser)) {
    return (
      <AgreementGate
        currentUser={currentUser}
        onAccept={acceptRequiredAgreements}
        onLogout={logout}
      />
    );
  }

  if (!currentUser.phoneVerified) {
    return (
      <PhoneVerificationView
        currentUser={currentUser}
        onRequestCode={requestCurrentUserPhoneCode}
        onVerified={verifyCurrentUserPhone}
        onLogout={logout}
      />
    );
  }

  const currentUserSuspension = getActiveSuspension(state, currentUser.id);
  const activeServiceNotice = state.serviceNotice?.active
    ? state.serviceNotice
    : publicStatus?.notice?.active
      ? publicStatus.notice
      : null;
  const canResetDemo = currentUser.role !== "member";
  const writeActionsDisabled = backendStatus === "offline" || backendStatus === "saving";
  const lastSyncLabel = lastSuccessfulSyncAt ? formatDateTime(lastSuccessfulSyncAt) : "아직 없음";
  const connectionIssueActive = backendStatus === "offline" || realtimeStatus !== "live" || Boolean(publicStatusError);
  const connectionTone = backendStatus === "offline" ? "offline" : realtimeStatus === "connecting" ? "reconnecting" : "warning";
  const connectionTitle =
    backendStatus === "offline"
      ? "API 연결 실패"
      : realtimeStatus === "connecting"
        ? "실시간 재연결 중"
        : realtimeStatus === "offline"
          ? "실시간 연결 끊김"
          : "운영 상태 확인 필요";
  const connectionBody =
    backendStatus === "offline"
      ? `${connectionNotice || "API 요청에 실패했습니다. 서버가 꺼졌거나 네트워크 연결이 끊겼을 수 있습니다."} 복구 전에는 저장, 투표, 운영 작업이 실패할 수 있습니다.`
      : realtimeStatus !== "live"
        ? "서버 이벤트 동기화가 지연되고 있습니다. 새 데이터는 재연결 후 반영됩니다."
        : publicStatusError || "운영 상태를 다시 확인해주세요.";

  return (
    <div
      className="app-shell"
      data-smoke="app-shell"
      data-backend-status={backendStatus}
      data-realtime-status={realtimeStatus}
      data-last-sync-at={lastSuccessfulSyncAt}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Gavel size={22} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">노수베스트</p>
            <h1>토론 아레나</h1>
          </div>
        </div>
        <nav className="topnav" aria-label="주요 메뉴">
          <NavButton active={view === "arena"} icon={<Radio size={18} />} label="토론장" onClick={() => setView("arena")} smokeId="nav-arena" />
          <NavButton active={view === "profile"} icon={<UserRound size={18} />} label="프로필" onClick={() => setView("profile")} smokeId="nav-profile" />
          <NavButton active={view === "admin"} icon={<Settings size={18} />} label="운영" onClick={() => setView("admin")} smokeId="nav-admin" />
          <NavButton active={view === "wallet"} icon={<Wallet size={18} />} label="코인" onClick={() => setView("wallet")} smokeId="nav-wallet" />
        </nav>
        <div className="account-strip">
          <span className={`backend-pill ${backendStatus}`}>
            {backendStatus === "checking"
              ? "API 확인"
              : backendStatus === "saving"
                ? "저장 중"
                : backendStatus === "connected"
                  ? backendStorage === "supabase"
                    ? "Supabase 연결됨"
                    : "API 연결됨"
                  : "로컬 모드"}
          </span>
          <span className={`realtime-pill ${realtimeStatus}`}>
            {realtimeStatus === "live"
              ? "실시간 동기화"
              : realtimeStatus === "connecting"
                ? "실시간 연결 중"
                : "실시간 끊김"}
          </span>
          <span className="sync-stamp" data-smoke="last-sync-at">
            최근 동기화 {lastSyncLabel}
          </span>
          <ServiceStatusPill
            status={publicStatus}
            error={publicStatusError}
            onRefresh={() => {
              void refreshPublicStatus();
            }}
          />
          <select
            aria-label="데모 계정 전환"
            value={currentUser.id}
            onChange={(event) => loginAs(event.target.value)}
            disabled={writeActionsDisabled}
            data-smoke="demo-user-switcher"
          >
            {activeUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} · {roleLabels[user.role]}
              </option>
            ))}
          </select>
          <div className="coin-pill" data-smoke="coin-pill" data-current-coins={currentUser.coins}>
            <Coins size={16} aria-hidden />
            {currentUser.coins.toLocaleString()}
          </div>
          <NotificationCenter
            notifications={currentUserNotifications}
            unreadCount={unreadNotificationCount}
            open={notificationsOpen}
            onToggle={() => setNotificationsOpen((isOpen) => !isOpen)}
            onOpenNotification={openNotification}
            onMarkNotificationRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
          {canResetDemo && (
            <button
              className="icon-button"
              type="button"
              title="데모 초기화"
              aria-label="데모 상태 초기화"
              onClick={resetDemo}
              disabled={writeActionsDisabled}
              data-smoke="reset-demo"
            >
              <RotateCcw size={18} aria-hidden />
            </button>
          )}
          <button className="logout-button" type="button" onClick={logout} data-smoke="logout-button">
            로그아웃
          </button>
        </div>
      </header>

      {connectionIssueActive && (
        <div
          className={`connection-banner ${connectionTone}`}
          role="status"
          aria-live="polite"
          data-smoke="connection-banner"
          data-backend-status={backendStatus}
          data-realtime-status={realtimeStatus}
        >
          <Radio size={17} aria-hidden />
          <div>
            <strong>{connectionTitle}</strong>
            <span>{connectionBody}</span>
            <small>마지막 성공 동기화: {lastSyncLabel}</small>
          </div>
          <button type="button" onClick={() => void retryConnection()} disabled={backendStatus === "saving"}>
            <RefreshCw size={15} aria-hidden />
            다시 연결
          </button>
        </div>
      )}

      {activeServiceNotice && (
        <div
          className={`service-notice-banner ${activeServiceNotice.tone}`}
          role="status"
          aria-live="polite"
          data-smoke="service-notice-banner"
          data-notice-tone={activeServiceNotice.tone}
          data-notice-expires-at={activeServiceNotice.expiresAt ?? ""}
        >
          <Bell size={17} aria-hidden />
          <div>
            <strong>{activeServiceNotice.title}</strong>
            <span>{activeServiceNotice.body}</span>
          </div>
          <small>
            {serviceNoticeToneLabels[activeServiceNotice.tone]} · {formatDateTime(activeServiceNotice.updatedAt)} · {formatServiceNoticeExpiry(activeServiceNotice)}
          </small>
        </div>
      )}

      {currentUserSuspension && (
        <div className="suspension-banner" role="alert">
          <strong>계정 일시 정지 중</strong>
          <span>
            {formatSuspensionUntil(currentUserSuspension)}까지 토론 참여, 채팅, 투표, 신고가 제한됩니다.
          </span>
          <small>
            남은 시간 {formatSuspensionRemaining(currentUserSuspension)} · {currentUserSuspension.reason}
          </small>
        </div>
      )}

      {view === "arena" && selectedRoom && (
        <ArenaView
          state={state}
          currentUser={currentUser}
          selectedRoom={selectedRoom}
          selectedChannel={selectedChannel}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(roomId) => {
            setSelectedRoomId(roomId);
            const firstChannel = state.channels.find((channel) => channel.roomId === roomId);
            setSelectedChannelId(firstChannel?.id ?? "");
          }}
          onSelectChannel={setSelectedChannelId}
          onCreateChannel={createChannel}
          onJoinChannel={joinChannel}
          onJoinChannelByCode={joinChannelByCode}
          onSpectateChannel={spectateChannel}
          onLeaveChannel={leaveChannel}
          onStartDebate={startDebate}
          onAdvanceDebatePhase={advanceDebatePhase}
          onPassTurn={passTurn}
          onSetParticipantStance={setParticipantStance}
          onSetParticipantReady={setParticipantReady}
          onSetVoiceState={setVoiceState}
          onMoveToVoting={moveToVoting}
          onAddDebateMessage={addDebateMessage}
          onAddSpectatorMessage={addSpectatorMessage}
          onSubmitReaction={submitReaction}
          onSubmitReport={submitReport}
          onSubmitAiAppeal={submitAiAppeal}
          onSubmitVote={submitVote}
          onFinalizeDebate={finalizeDebate}
          onDeleteChannel={deleteChannel}
          onUpdateInviteCode={updateChannelInviteCode}
          judgingChannelId={judgingChannelId}
          socketRef={socketRef}
        />
      )}
      {view === "profile" && (
        <ProfileView
          currentUser={currentUser}
          privacyRequests={state.privacyRequests}
          onSave={saveUserProfile}
          onRequestClaimVerification={requestClaimVerification}
          onChangePhone={changeCurrentUserPhone}
          onChangePassword={changeCurrentUserPassword}
          onDeactivateAccount={deactivateCurrentUser}
          onExportData={exportCurrentUserData}
          onRequestPrivacyDeletion={requestPrivacyDeletion}
          onRefreshSession={refreshCurrentSession}
        />
      )}
      {view === "admin" && (
        <AdminView
          state={state}
          currentUser={currentUser}
          serviceStatus={publicStatus}
          serviceStatusError={publicStatusError}
          onCreateRoom={createRoom}
          onUpdateRoom={updateRoom}
          onDeleteRoom={deleteRoom}
          onSetUserRole={setUserRole}
          onSanctionUser={sanctionUser}
          onRevokeSanction={revokeSanction}
          onVerifyClaim={verifyUserClaim}
          onResolveReport={resolveReport}
          onResolveAiAppeal={resolveAiAppeal}
          onResolvePrivacyRequest={resolvePrivacyRequest}
          onForceFinishChannel={forceFinishChannel}
          onDeleteChannel={deleteChannel}
          onCheckReadiness={checkReadiness}
          onCheckStorage={checkStorage}
          onExportStateBackup={exportStateBackup}
          onExportSecureStateBackup={exportSecureStateBackup}
          onExportAuditLogs={exportAuditLogs}
          onValidateStateBackup={validateStateBackup}
          onRestoreStateBackup={restoreStateBackup}
          onSyncNormalizedStorage={syncNormalizedStorage}
          onSeedDemoStorage={seedDemoStorage}
          onUpdateServiceNotice={updateServiceNotice}
          onUpdatePlatformSettings={updatePlatformSettings}
          onAdjustUserCoins={adjustUserCoins}
        />
      )}
      {view === "wallet" && <WalletView state={state} currentUser={currentUser} onPurchase={purchaseShopItem} />}
    </div>
  );
}

const notificationKindLabels: Record<NotificationKind, string> = {
  system: "시스템",
  role: "권한",
  sanction: "운영",
  report: "신고",
  debate: "토론",
  shop: "상점",
  profile: "프로필",
};

const NOTIFICATION_RECENT_LIMIT = 12;
type NotificationFilter = "all" | "unread";

const notificationViewLabels: Record<NonNullable<UserNotification["view"]>, string> = {
  arena: "토론으로 이동",
  profile: "프로필 보기",
  admin: "운영 화면 보기",
  wallet: "코인 내역 보기",
};

function notificationActionLabel(notification: UserNotification) {
  if (notification.view) return notificationViewLabels[notification.view];
  if (notification.channelId || notification.roomId) return "관련 토론 보기";
  return "확인";
}

function NotificationCenter({
  notifications,
  unreadCount,
  open,
  onToggle,
  onOpenNotification,
  onMarkNotificationRead,
  onMarkAllRead,
}: {
  notifications: UserNotification[];
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  onOpenNotification: (notification: UserNotification) => void;
  onMarkNotificationRead: (notificationId: string) => Promise<ActionResult>;
  onMarkAllRead: () => Promise<ActionResult>;
}) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const filteredNotifications =
    filter === "unread" ? notifications.filter((notification) => !notification.readAt) : notifications;
  const visibleNotifications = filteredNotifications.slice(0, NOTIFICATION_RECENT_LIMIT);
  const hiddenCount = Math.max(filteredNotifications.length - visibleNotifications.length, 0);
  const notificationPanelId = "notification-panel";

  return (
    <div className="notification-center" data-smoke="notification-center" data-unread-count={unreadCount}>
      <button
        className={`icon-button notification-trigger ${open ? "active" : ""}`}
        type="button"
        title="알림"
        aria-label={`알림 센터 ${open ? "닫기" : "열기"}, 미읽음 ${unreadCount}개`}
        aria-expanded={open}
        aria-controls={notificationPanelId}
        onClick={onToggle}
        data-smoke="notification-trigger"
      >
        <Bell size={18} aria-hidden />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <section
          id={notificationPanelId}
          className="notification-panel"
          role="region"
          aria-label="알림 센터"
          aria-live="polite"
          data-smoke="notification-panel"
        >
          <div className="notification-panel-head">
            <div>
              <strong>알림</strong>
              <span>{unreadCount > 0 ? `${unreadCount}개 안 읽음` : "모두 확인함"}</span>
            </div>
            <button
              type="button"
              className="notification-read-all"
              disabled={unreadCount === 0}
              onClick={() => {
                void onMarkAllRead();
              }}
            >
              <CheckCheck size={16} aria-hidden />
              모두 읽음
            </button>
          </div>
          <div className="notification-filter-bar" role="group" aria-label="알림 필터">
            <button
              type="button"
              className={filter === "all" ? "active" : ""}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              data-notification-filter="all"
            >
              전체
            </button>
            <button
              type="button"
              className={filter === "unread" ? "active" : ""}
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
              data-notification-filter="unread"
            >
              미읽음 {unreadCount > 0 ? unreadCount : ""}
            </button>
          </div>

          <div className="notification-list" role="list" aria-live="polite">
            {visibleNotifications.length === 0 && (
              <div className="notification-empty" role="status">
                <Inbox size={22} aria-hidden />
                <strong>{filter === "unread" ? "새 알림이 없습니다." : "아직 알림이 없습니다."}</strong>
                <span>
                  {filter === "unread"
                    ? "모든 알림을 확인했습니다."
                    : "토론 결과, 운영 처리, 상점 구매 내역이 여기에 쌓입니다."}
                </span>
              </div>
            )}
            {visibleNotifications.map((notification) => (
              <article
                className={`notification-item ${notification.readAt ? "read" : "unread"}`}
                key={notification.id}
                role="listitem"
                aria-label={`${notification.readAt ? "읽은" : "읽지 않은"} 알림: ${notification.title}`}
                data-smoke="notification-item"
                data-notification-kind={notification.kind}
                data-read-state={notification.readAt ? "read" : "unread"}
              >
                <span className={`notification-kind ${notification.kind}`}>
                  {notificationKindLabels[notification.kind] ?? "알림"}
                </span>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <small>{notification.createdAt}</small>
                </div>
                <div className="notification-actions">
                  {!notification.readAt && (
                    <button
                      type="button"
                      className="notification-read-all"
                      aria-label={`${notification.title} 알림 읽음 처리`}
                      onClick={() => {
                        void onMarkNotificationRead(notification.id);
                      }}
                    >
                      <Check size={15} aria-hidden />
                      읽음
                    </button>
                  )}
                  <button
                    type="button"
                    className="notification-read-all"
                    aria-label={`${notification.title} - ${notificationActionLabel(notification)}`}
                    onClick={() => onOpenNotification(notification)}
                  >
                    {notificationActionLabel(notification)}
                  </button>
                </div>
              </article>
            ))}
            {hiddenCount > 0 && (
              <div className="notification-empty compact" role="status">
                최근 {NOTIFICATION_RECENT_LIMIT}개만 표시 중입니다. 이전 알림 {hiddenCount}개는 보관되어 있습니다.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type VisibleServiceStatus = PublicServiceStatusLevel | "checking";

const visibleStatusLabels: Record<VisibleServiceStatus, string> = {
  operational: "정상 운영",
  degraded: "주의 필요",
  maintenance: "점검/중요 공지",
  checking: "상태 확인 중",
};

function visibleServiceStatus(status: PublicServiceStatus | null, error?: string): VisibleServiceStatus {
  if (status?.status) return status.status;
  return error ? "degraded" : "checking";
}

function ServiceStatusPill({
  status,
  error,
  onRefresh,
}: {
  status: PublicServiceStatus | null;
  error?: string;
  onRefresh: () => void;
}) {
  const visibleStatus = visibleServiceStatus(status, error);
  const label = status?.label ?? (error ? "상태 확인 실패" : visibleStatusLabels[visibleStatus]);
  return (
    <button
      className={`service-status-pill ${visibleStatus}`}
      type="button"
      title="운영 상태 새로고침"
      onClick={onRefresh}
      data-smoke="service-status-pill"
      data-service-status={visibleStatus}
    >
      <CircleCheck size={15} aria-hidden />
      {label}
    </button>
  );
}

function PublicServiceStatusCard({
  status,
  fallbackNotice,
  error,
  onRefresh,
}: {
  status: PublicServiceStatus | null;
  fallbackNotice: ServiceNotice | null;
  error: string;
  onRefresh: () => void;
}) {
  const visibleStatus = visibleServiceStatus(status, error);
  const notice = fallbackNotice?.active ? fallbackNotice : status?.notice;
  const storageLabel = status
    ? status.storage.storage === "supabase"
      ? `Supabase ${status.storage.storageMode}`
      : "파일 저장소"
    : "저장소 확인 중";
  const realtimeLabel = status?.realtime.enabled
    ? `${status.realtime.clients.toLocaleString()}명 연결`
    : "실시간 확인 중";
  const releaseLabel = status ? `${status.runtime.release.version} · ${status.runtime.release.commitShort}` : "릴리스 확인 중";
  const checkedLabel = status?.checkedAt ? `${formatDateTime(status.checkedAt)} 확인` : error || "서버 응답을 확인하고 있습니다.";

  return (
    <aside
      className={`public-status-card ${visibleStatus}`}
      data-smoke="public-service-status"
      data-service-status={visibleStatus}
    >
      <div className="public-status-head">
        <div className="public-status-title">
          <span className="public-status-icon">
            <CircleCheck size={18} aria-hidden />
          </span>
          <div>
            <strong>{status?.label ?? (error ? "상태 확인 실패" : visibleStatusLabels[visibleStatus])}</strong>
            <span>{checkedLabel}</span>
          </div>
        </div>
        <button type="button" className="public-status-refresh" onClick={onRefresh} aria-label="운영 상태 새로고침">
          <RefreshCw size={15} aria-hidden />
        </button>
      </div>
      <div className="public-status-meta" aria-label="운영 상태 요약">
        <span>
          <Database size={14} aria-hidden />
          {storageLabel}
        </span>
        <span>
          <Radio size={14} aria-hidden />
          {realtimeLabel}
        </span>
        <span>
          <Globe2 size={14} aria-hidden />
          {releaseLabel}
        </span>
      </div>
      {notice && (
        <div className={`public-status-notice ${notice.tone}`} data-smoke="public-service-notice">
          <strong>{notice.title}</strong>
          <span>{notice.body}</span>
          <small>
            {serviceNoticeToneLabels[notice.tone]} · {formatDateTime(notice.updatedAt)} · {formatServiceNoticeExpiry(notice)}
          </small>
        </div>
      )}
    </aside>
  );
}

function AuthView({
  state,
  onLogin,
  onSignup,
  onRequestPasswordResetCode,
  onConfirmPasswordReset,
  onSocialLogin,
  onSelectDemo,
  authNotice,
  serviceStatus,
  serviceStatusError,
  onRefreshServiceStatus,
}: {
  state: AppState;
  onLogin: (loginId: string, password: string) => Promise<AuthResult>;
  onSignup: (payload: SignupPayload) => Promise<AuthResult>;
  onRequestPasswordResetCode: (loginId: string, phone: string) => Promise<PhoneCodeResult>;
  onConfirmPasswordReset: (loginId: string, phone: string, code: string, newPassword: string) => Promise<AuthResult>;
  onSocialLogin: (provider: Exclude<Provider, "local">) => Promise<AuthResult>;
  onSelectDemo: (userId: string) => Promise<AuthResult>;
  authNotice: string;
  serviceStatus: PublicServiceStatus | null;
  serviceStatusError: string;
  onRefreshServiceStatus: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetDevCode, setResetDevCode] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetCooldown, setResetCooldown] = useState(0);
  const [signupAccent, setSignupAccent] = useState<ProfileAccent>("blue");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const authFeedbackId = error ? "auth-form-error" : authNotice ? "auth-form-notice" : undefined;
  const authFieldInvalid = Boolean(error);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResetCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetCooldown]);

  const switchMode = (nextMode: "login" | "signup" | "reset") => {
    setMode(nextMode);
    setError("");
    setResetMessage("");
  };

  const submitLocal = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    if (mode === "login") {
      const result = await onLogin(loginId.trim(), password);
      if (!result.ok) setError(result.message ?? "로그인에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    if (mode === "reset") {
      if (!loginId.trim() || !phone.trim() || !resetCode.trim() || !password.trim() || !passwordConfirm.trim()) {
        setError("아이디, 전화번호, 인증번호, 새 비밀번호를 모두 입력해 주세요.");
        setSubmitting(false);
        return;
      }
      if (password.length < 6) {
        setError("새 비밀번호는 6자 이상으로 만들어 주세요.");
        setSubmitting(false);
        return;
      }
      if (password !== passwordConfirm) {
        setError("새 비밀번호 확인이 일치하지 않습니다.");
        setSubmitting(false);
        return;
      }
      const result = await onConfirmPasswordReset(loginId.trim(), phone.trim(), resetCode.trim(), password);
      if (!result.ok) {
        setError(result.message ?? "비밀번호 재설정에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      setResetMessage("비밀번호가 재설정되었습니다.");
      setSubmitting(false);
      return;
    }

    if (!loginId.trim() || !password.trim() || !displayName.trim() || !phone.trim()) {
      setError("아이디, 비밀번호, 닉네임, 전화번호를 모두 입력해 주세요.");
      setSubmitting(false);
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상으로 만들어 주세요.");
      setSubmitting(false);
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      setSubmitting(false);
      return;
    }
    if (!/^010-?\d{4}-?\d{4}$/.test(phone.trim())) {
      setError("전화번호는 010-0000-0000 형식으로 입력해 주세요.");
      setSubmitting(false);
      return;
    }
    if (state.users.some((item) => item.loginId === loginId.trim())) {
      setError("이미 사용 중인 아이디입니다.");
      setSubmitting(false);
      return;
    }
    const result = await onSignup({
      loginId: loginId.trim(),
      password,
      displayName: displayName.trim(),
      phone,
      accentColor: signupAccent,
    });
    if (!result.ok) setError(result.message ?? "계정 생성에 실패했습니다.");
    setSubmitting(false);
  };

  const requestResetCode = async () => {
    setError("");
    setResetMessage("");
    if (!loginId.trim() || !phone.trim()) {
      setError("아이디와 전화번호를 입력해 주세요.");
      return;
    }
    if (!/^010-?\d{4}-?\d{4}$/.test(phone.trim())) {
      setError("전화번호는 010-0000-0000 형식으로 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    const result = await onRequestPasswordResetCode(loginId.trim(), phone.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? "인증번호 요청에 실패했습니다.");
      if (result.resendAfterSeconds) setResetCooldown(result.resendAfterSeconds);
      return;
    }
    setResetCodeSent(true);
    setResetDevCode(result.devCode ?? "");
    setResetCooldown(result.resendAfterSeconds ?? 30);
    setResetMessage(result.smsSent ? "인증번호를 문자로 보냈습니다." : "개발 모드 인증번호가 발급되었습니다.");
  };

  const socialLogin = async (provider: Exclude<Provider, "local">) => {
    setError("");
    setSubmitting(true);
    const result = await onSocialLogin(provider);
    if (!result.ok) setError(result.message ?? "간편 로그인에 실패했습니다.");
    setSubmitting(false);
  };

  const selectDemo = async (userId: string) => {
    setError("");
    setSubmitting(true);
    const result = await onSelectDemo(userId);
    if (!result.ok) setError(result.message ?? "데모 계정 전환에 실패했습니다.");
    setSubmitting(false);
  };

  return (
    <main className="auth-layout" data-smoke="auth-layout">
      <div className="auth-stack">
        <section className="auth-panel">
          <div className="brand-lockup auth-brand">
            <div className="brand-mark">
              <Gavel size={24} aria-hidden />
            </div>
            <div>
              <p className="eyebrow">계정 필수</p>
              <h1>토론 아레나 입장</h1>
            </div>
          </div>
          <div className="segmented">
            <button
              className={mode === "login" ? "active" : ""}
              type="button"
              aria-pressed={mode === "login"}
              onClick={() => switchMode("login")}
            >
              로그인
            </button>
            <button
              className={mode === "signup" ? "active" : ""}
              type="button"
              aria-pressed={mode === "signup"}
              onClick={() => switchMode("signup")}
            >
              가입
            </button>
            <button
              className={mode === "reset" ? "active" : ""}
              type="button"
              aria-pressed={mode === "reset"}
              onClick={() => switchMode("reset")}
            >
              비밀번호 찾기
            </button>
          </div>
          <form className="stack-form" onSubmit={submitLocal} aria-describedby={authFeedbackId}>
            <label htmlFor="auth-login-id">
              아이디
              <input
                id="auth-login-id"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="nosu"
                aria-invalid={authFieldInvalid || undefined}
                aria-describedby={authFeedbackId}
              />
            </label>
            <label htmlFor="auth-password">
              {mode === "reset" ? "새 비밀번호" : "비밀번호"}
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "reset" ? "6자 이상" : "demo"}
                aria-invalid={authFieldInvalid || undefined}
                aria-describedby={authFeedbackId}
              />
            </label>
            {(mode === "signup" || mode === "reset") && (
              <>
                <label htmlFor="auth-password-confirm">
                  {mode === "reset" ? "새 비밀번호 확인" : "비밀번호 확인"}
                  <input
                    id="auth-password-confirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="한 번 더 입력"
                    aria-invalid={authFieldInvalid || undefined}
                    aria-describedby={authFeedbackId}
                  />
                </label>
                <label htmlFor="auth-phone">
                  전화번호
                  <input
                    id="auth-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="010-0000-0000"
                    aria-invalid={authFieldInvalid || undefined}
                    aria-describedby={authFeedbackId}
                  />
                </label>
              </>
            )}
            {mode === "signup" && (
              <>
                <label htmlFor="auth-display-name">
                  닉네임
                  <input
                    id="auth-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="닉네임"
                    aria-invalid={authFieldInvalid || undefined}
                    aria-describedby={authFeedbackId}
                  />
                </label>
                <div className="decor-control">
                  <span>프로필 컬러</span>
                  <div className="accent-picker">
                    {accentOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`accent-swatch ${option.value} ${signupAccent === option.value ? "selected" : ""}`}
                        type="button"
                        title={option.label}
                        aria-label={`${option.label} 프로필 컬러 선택`}
                        aria-pressed={signupAccent === option.value}
                        onClick={() => setSignupAccent(option.value)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
            {mode === "reset" && (
              <div className="password-reset-box">
                <div className="reset-code-row">
                  <label htmlFor="auth-reset-code">
                    인증번호
                    <input
                      id="auth-reset-code"
                      value={resetCode}
                      onChange={(event) => setResetCode(event.target.value)}
                      placeholder="6자리"
                      inputMode="numeric"
                      aria-invalid={authFieldInvalid || undefined}
                      aria-describedby={authFeedbackId}
                    />
                  </label>
                  <button type="button" onClick={requestResetCode} disabled={submitting || resetCooldown > 0}>
                    <Phone size={16} aria-hidden />
                    {resetCooldown > 0 ? `${resetCooldown}초` : resetCodeSent ? "다시 받기" : "인증번호 받기"}
                  </button>
                </div>
                {resetDevCode && (
                  <div className="phone-code-card">
                    <span>개발 모드 인증번호</span>
                    <strong>{resetDevCode}</strong>
                    <small>운영 SMS를 연결하면 이 번호는 화면에 노출되지 않습니다.</small>
                  </div>
                )}
                {resetMessage && (
                  <p className="quiet-text" id="auth-reset-message" role="status" aria-live="polite">
                    {resetMessage}
                  </p>
                )}
              </div>
            )}
            {error && (
              <p className="form-error" id="auth-form-error" role="alert">
                {error}
              </p>
            )}
            {!error && authNotice && (
              <p className="form-error" id="auth-form-notice" role="alert">
                {authNotice}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={submitting}>
              <LogIn size={18} aria-hidden />
              {submitting
                ? "처리 중"
                : mode === "login"
                  ? "아이디로 로그인"
                  : mode === "signup"
                    ? "계정 만들고 인증하기"
                    : "비밀번호 재설정"}
            </button>
          </form>
          {mode === "login" && (
            <>
              <div className="provider-grid" aria-label="간편 로그인">
                {(["google", "apple", "naver", "kakao"] as const).map((provider) => (
                  <button key={provider} type="button" onClick={() => socialLogin(provider)} disabled={submitting}>
                    {providerLabels[provider]}
                  </button>
                ))}
              </div>
              <div className="demo-logins">
                <button type="button" onClick={() => selectDemo("u_admin")} disabled={submitting} data-smoke="demo-admin-login">
                  <ShieldCheck size={17} aria-hidden />
                  운영자 데모
                </button>
                <button type="button" onClick={() => selectDemo("u_seojun")} disabled={submitting} data-smoke="demo-member-login">
                  <UserRound size={17} aria-hidden />
                  참가자 데모
                </button>
              </div>
            </>
          )}
        </section>
        <PublicServiceStatusCard
          status={serviceStatus}
          fallbackNotice={state.serviceNotice}
          error={serviceStatusError}
          onRefresh={() => {
            void onRefreshServiceStatus();
          }}
        />
      </div>
    </main>
  );
}

function AgreementGate({
  currentUser,
  onAccept,
  onLogout,
}: {
  currentUser: User;
  onAccept: () => Promise<ActionResult>;
  onLogout: () => void | Promise<void>;
}) {
  const [checked, setChecked] = useState({ terms: false, privacy: false, community: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const allChecked = checked.terms && checked.privacy && checked.community;

  const toggle = (key: keyof typeof checked) => {
    setChecked((current) => ({ ...current, [key]: !current[key] }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!allChecked) {
      setMessage("필수 약관을 모두 확인해주세요.");
      return;
    }
    setSaving(true);
    const result = await onAccept();
    if (!result.ok) setMessage(result.message ?? "필수 약관 동의 저장에 실패했습니다.");
    setSaving(false);
  };

  return (
    <main className="auth-layout" data-smoke="agreement-gate" data-agreement-accepted="false">
      <div className="auth-stack">
        <section className="auth-panel">
          <div className="brand-lockup auth-brand">
            <div className="brand-mark">
              <ShieldCheck size={24} aria-hidden />
            </div>
            <div>
              <p className="eyebrow">서비스 약속</p>
              <h1>필수 약관 동의</h1>
            </div>
          </div>
          <p className="quiet-text">
            {currentUser.displayName}님, 토론 입장과 코인 기능을 사용하기 전에 서비스 이용약관,
            개인정보 처리방침, 커뮤니티 규칙을 확인해주세요.
          </p>
          <form className="stack-form" onSubmit={submit}>
            <label>
              <input
                type="checkbox"
                checked={checked.terms}
                onChange={() => toggle("terms")}
                data-smoke="agreement-terms"
              />
              서비스 이용약관에 동의합니다.
            </label>
            <label>
              <input
                type="checkbox"
                checked={checked.privacy}
                onChange={() => toggle("privacy")}
                data-smoke="agreement-privacy"
              />
              개인정보 처리방침에 동의합니다.
            </label>
            <label>
              <input
                type="checkbox"
                checked={checked.community}
                onChange={() => toggle("community")}
                data-smoke="agreement-community"
              />
              커뮤니티 규칙과 신고/제재 정책을 준수합니다.
            </label>
            {message && <p className="form-error">{message}</p>}
            <button type="submit" disabled={!allChecked || saving} data-smoke="agreement-accept">
              <Check size={16} aria-hidden />
              {saving ? "저장 중" : "동의하고 계속하기"}
            </button>
            <button type="button" className="ghost-button" onClick={() => void onLogout()} disabled={saving}>
              <LogOut size={16} aria-hidden />
              로그아웃
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function PhoneVerificationView({
  currentUser,
  onRequestCode,
  onVerified,
  onLogout,
}: {
  currentUser: User;
  onRequestCode: (phone: string) => Promise<PhoneCodeResult>;
  onVerified: (phone: string, code: string) => Promise<AuthResult>;
  onLogout: () => void;
}) {
  const [phone, setPhone] = useState(currentUser.phone);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devCode, setDevCode] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const changePhone = (nextPhone: string) => {
    setPhone(nextPhone);
    setSent(false);
    setCode("");
    setError("");
    setMessage("");
    setDevCode("");
    setSmsSent(false);
    setExpiresAt(null);
    setCooldown(0);
  };

  const requestCode = async () => {
    setError("");
    setMessage("");
    if (!/^010-?\d{4}-?\d{4}$/.test(phone.trim())) {
      setError("전화번호는 010-0000-0000 형식으로 입력해 주세요.");
      return;
    }
    setRequesting(true);
    const result = await onRequestCode(phone.trim());
    setRequesting(false);
    if (!result.ok) {
      setError(result.message ?? "인증번호 요청에 실패했습니다.");
      if (result.resendAfterSeconds) setCooldown(result.resendAfterSeconds);
      return;
    }
    setSent(true);
    setCode("");
    setDevCode(result.devCode ?? "");
    setSmsSent(Boolean(result.smsSent));
    setExpiresAt(result.expiresAt ?? (result.expiresInSeconds ? Date.now() + result.expiresInSeconds * 1000 : null));
    setCooldown(result.resendAfterSeconds ?? 30);
    setMessage(result.smsSent ? "인증번호를 문자로 보냈습니다. 5분 안에 입력해주세요." : "인증번호를 발급했습니다. 5분 안에 입력해주세요.");
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!sent) {
      setError("먼저 인증번호를 받아주세요.");
      return;
    }
    if (!code.trim()) {
      setError("인증번호를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    const result = await onVerified(phone, code.trim());
    if (!result.ok) setError(result.message ?? "전화번호 인증에 실패했습니다.");
    setSubmitting(false);
  };

  return (
    <main className="auth-layout">
      <section className="auth-panel compact-auth">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark">
            <Phone size={24} aria-hidden />
          </div>
          <div>
            <p className="eyebrow">필수 인증</p>
            <h1>전화번호 확인</h1>
          </div>
        </div>
        <form className="stack-form" onSubmit={verify}>
          <label>
            전화번호
            <input value={phone} onChange={(event) => changePhone(event.target.value)} placeholder="010-0000-0000" />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={requesting || cooldown > 0 || submitting}
            onClick={() => {
              void requestCode();
            }}
          >
            <Send size={17} aria-hidden />
            {requesting ? "발급 중" : cooldown > 0 ? `재발송 ${cooldown}초` : sent ? "인증번호 다시 받기" : "인증번호 받기"}
          </button>
          {sent && (
            <>
              <label>
                인증번호
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6자리 숫자"
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <div className="phone-code-card">
                <span>{devCode ? "개발용 인증번호" : smsSent ? "문자 발송 완료" : "인증번호 발급됨"}</span>
                <strong>{devCode || (smsSent ? "휴대폰 문자함을 확인해주세요" : "개발 모드 인증번호 발급")}</strong>
                {expiresAt && <small>{formatDateTime(new Date(expiresAt).toISOString())}까지 유효</small>}
              </div>
            </>
          )}
          {message && <p className="quiet-text">{message}</p>}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={!sent || submitting || !code.trim()}>
            <Check size={18} aria-hidden />
            {submitting ? "인증 중" : "인증 완료"}
          </button>
        </form>
        <button className="text-button" type="button" onClick={onLogout}>
          다른 계정으로 로그인
        </button>
      </section>
    </main>
  );
}

function ArenaView({
  state,
  currentUser,
  selectedRoom,
  selectedChannel,
  selectedRoomId,
  onSelectRoom,
  onSelectChannel,
  onCreateChannel,
  onJoinChannel,
  onJoinChannelByCode,
  onSpectateChannel,
  onLeaveChannel,
  onStartDebate,
  onAdvanceDebatePhase,
  onPassTurn,
  onSetParticipantStance,
  onSetParticipantReady,
  onSetVoiceState,
  onMoveToVoting,
  onAddDebateMessage,
  onAddSpectatorMessage,
  onSubmitReaction,
  onSubmitReport,
  onSubmitAiAppeal,
  onSubmitVote,
  onFinalizeDebate,
  onDeleteChannel,
  onUpdateInviteCode,
  judgingChannelId,
  socketRef,
}: {
  state: AppState;
  currentUser: User;
  selectedRoom: Room;
  selectedChannel: DebateChannel | null;
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (
    roomId: string,
    title: string,
    visibility: ChannelVisibility,
    format: DebateFormat,
    coinStake: number,
  ) => Promise<ChannelActionResult>;
  onJoinChannel: (channelId: string, user: User) => Promise<ChannelActionResult>;
  onJoinChannelByCode: (code: string) => Promise<ChannelActionResult>;
  onSpectateChannel: (channelId: string, userId: string) => Promise<ChannelActionResult>;
  onLeaveChannel: (channelId: string) => Promise<ChannelActionResult>;
  onStartDebate: (channelId: string) => Promise<ChannelActionResult>;
  onAdvanceDebatePhase: (channelId: string) => Promise<ChannelActionResult>;
  onPassTurn: (channelId: string) => Promise<ChannelActionResult>;
  onSetParticipantStance: (channelId: string, userId: string, stance: DebateStance) => Promise<ChannelActionResult>;
  onSetParticipantReady: (channelId: string, userId: string, ready: boolean) => Promise<ChannelActionResult>;
  onSetVoiceState: (
    channelId: string,
    userId: string,
    voiceState: Pick<VoiceState, "muted" | "handRaised">,
  ) => Promise<ChannelActionResult>;
  onMoveToVoting: (channelId: string) => Promise<ChannelActionResult>;
  onAddDebateMessage: (channelId: string, body: string) => Promise<ChannelActionResult>;
  onAddSpectatorMessage: (channelId: string, body: string) => Promise<ChannelActionResult>;
  onSubmitReaction: (channelId: string, targetUserId: string) => Promise<ChannelActionResult>;
  onSubmitReport: (
    targetType: ReportTargetType,
    targetId: string,
    channelId: string | undefined,
    reason: string,
  ) => Promise<ChannelActionResult>;
  onSubmitAiAppeal: (channelId: string, reason: string) => Promise<ActionResult>;
  onSubmitVote: (channelId: string, targetUserId: string) => Promise<ChannelActionResult>;
  onFinalizeDebate: (channelId: string) => Promise<ActionResult>;
  onDeleteChannel: (channelId: string) => Promise<ChannelActionResult>;
  onUpdateInviteCode: (channelId: string, action: "regenerate" | "disable") => Promise<ChannelActionResult>;
  judgingChannelId: string | null;
  socketRef: MutableRefObject<Socket | null>;
}) {
  const roomChannels = state.channels.filter((channel) => channel.roomId === selectedRoom.id);
  const liveCount = state.channels.filter((channel) => channel.status === "live").length;
  const spectatorCount = state.channels.reduce((total, channel) => total + channel.spectatorIds.length, 0);
  const [inviteCode, setInviteCode] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChannelStatus | "all">("all");
  const [sortMode, setSortMode] = useState<ChannelSort>("latest");
  const [joinError, setJoinError] = useState("");
  const finishedChannels = roomChannels.filter((channel) => channel.status === "finished").slice().reverse();
  const channelOrder = new Map(roomChannels.map((channel, index) => [channel.id, index]));
  const normalizedChannelSearch = channelSearch.trim().toLowerCase();
  const sortedChannels = roomChannels
    .filter((channel) => {
      const matchesStatus = statusFilter === "all" || channel.status === statusFilter;
      const searchable = [
        channel.title,
        channel.visibility === "public" ? "공개" : "비공개",
        channel.format === "voice" ? "음성" : "채팅",
        statusLabels[channel.status],
        phaseLabels[channel.phase],
      ].join(" ");
      const matchesSearch = searchable.toLowerCase().includes(normalizedChannelSearch);
      return matchesStatus && matchesSearch;
    })
    .sort((left, right) => {
      const rankChannel = (channel: DebateChannel) => {
        if (sortMode === "waiting") {
          return channel.status === "waiting" && channel.participantIds.length < channel.participantLimit ? 0 : 1;
        }
        if (sortMode === "live") return channel.status === "live" ? 0 : 1;
        if (sortMode === "finished") return channel.status === "finished" ? 0 : 1;
        return 0;
      };
      const rankDiff = rankChannel(left) - rankChannel(right);
      if (rankDiff !== 0) return rankDiff;
      return (channelOrder.get(left.id) ?? 0) - (channelOrder.get(right.id) ?? 0);
    });
  const hasChannelFilters = Boolean(normalizedChannelSearch) || statusFilter !== "all" || sortMode !== "latest";
  const resetChannelFilters = () => {
    setChannelSearch("");
    setStatusFilter("all");
    setSortMode("latest");
  };

  const joinByCode = async () => {
    const normalized = inviteCode.trim().toUpperCase();
    if (!normalized) {
      setJoinError("입장 코드를 입력해주세요.");
      return;
    }
    const result = await onJoinChannelByCode(normalized);
    if (!result.ok) {
      setJoinError(result.message ?? "입장 코드 참가에 실패했습니다.");
      return;
    }
    setJoinError("");
    setInviteCode("");
    if (result.roomId) onSelectRoom(result.roomId);
    if (result.channelId) onSelectChannel(result.channelId);
  };

  return (
    <main className="arena-grid" data-smoke="arena-grid">
      <aside className="room-rail" aria-label="토론 주제 방">
        <div className="rail-header">
          <p className="eyebrow">운영자 생성</p>
          <h2>주제 방</h2>
        </div>
        <div className="room-list" data-smoke="room-list">
          {state.rooms.map((room) => {
            const count = state.channels.filter((channel) => channel.roomId === room.id).length;
            return (
              <button
                key={room.id}
                type="button"
                className={`room-item ${room.id === selectedRoomId ? "selected" : ""}`}
                onClick={() => onSelectRoom(room.id)}
                data-smoke="room-item"
                data-room-id={room.id}
              >
                <span className="room-icon">{getRoomIcon(room)}</span>
                <span className="room-copy">
                  <strong>{room.title}</strong>
                  <small>{count}개 채널</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="code-entry">
          <label>
            입장 코드
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="NB-2046"
              data-smoke="invite-code-input"
            />
          </label>
          <button type="button" onClick={joinByCode} data-smoke="invite-code-submit">
            <KeyRound size={17} aria-hidden />
            코드 입장
          </button>
          {joinError && <p className="form-error">{joinError}</p>}
        </div>
      </aside>

      <section className="workspace">
        <div className="toss-hero">
          <div>
            <p className="eyebrow">오늘의 토론</p>
            <h2>{selectedRoom.title}</h2>
            <p>{selectedRoom.topic}</p>
          </div>
          <div className="hero-kpis">
            <span className="hero-kpi blue">
              <i>
                <Hash size={17} aria-hidden />
              </i>
              <strong>{roomChannels.length}</strong>
              <em>채널</em>
            </span>
            <span className="hero-kpi mint">
              <i>
                <Radio size={17} aria-hidden />
              </i>
              <strong>{liveCount}</strong>
              <em>진행</em>
            </span>
            <span className="hero-kpi violet">
              <i>
                <Eye size={17} aria-hidden />
              </i>
              <strong>{spectatorCount}</strong>
              <em>관전</em>
            </span>
          </div>
        </div>
        <div className="metric-row">
          <Metric icon={<Radio size={18} />} label="진행 중" value={`${liveCount}개`} />
          <Metric icon={<Eye size={18} />} label="관전자" value={`${spectatorCount}명`} />
          <Metric icon={<BadgeCheck size={18} />} label="전화 인증" value={`${state.users.filter((user) => user.phoneVerified).length}명`} />
          <Metric icon={<Store size={18} />} label="상점 재화" value="코인" />
        </div>

        <section className="room-workspace">
          <div className="section-heading">
          <div>
            <p className="eyebrow">토론 주제</p>
            <h2>{selectedRoom.title}</h2>
              <p>{selectedRoom.topic}</p>
            </div>
            <RoleBadge role={currentUser.role} />
          </div>
          <ChannelComposer
            currentUser={currentUser}
            selectedRoom={selectedRoom}
            defaultCoinStake={state.platformSettings.debate.defaultCoinStake}
            onCreateChannel={onCreateChannel}
          />
        </section>

        <section className="channel-list-section" data-smoke="channel-list-section">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">채널</p>
              <h2>입장 전 프로필 미리보기</h2>
            </div>
            <div className="channel-tools">
              <label className="channel-search">
                검색
                <input
                  value={channelSearch}
                  onChange={(event) => setChannelSearch(event.target.value)}
                  placeholder="채널명, 공개, 음성"
                  data-smoke="channel-search"
                />
              </label>
              <label className="channel-sort">
                정렬
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as ChannelSort)}
                  data-smoke="channel-sort"
                >
                  <option value="latest">최신순</option>
                  <option value="waiting">참여 대기 우선</option>
                  <option value="live">라이브 우선</option>
                  <option value="finished">종료 토론 우선</option>
                </select>
              </label>
            </div>
          </div>
        <div className="filter-tabs" aria-label="채널 상태 필터">
          {(["all", "waiting", "live", "voting", "finished"] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "active" : ""}
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "전체" : statusLabels[status]}
            </button>
          ))}
        </div>
        <DebateArchivePanel
          channels={finishedChannels}
          users={state.users}
          selectedChannelId={selectedChannel?.id}
          onSelectChannel={onSelectChannel}
        />
        <div className="channel-list" data-smoke="channel-list">
            {roomChannels.length === 0 && <EmptyState title="아직 열린 채널이 없습니다." body="첫 번째 토론 채널을 만들어 보세요." />}
            {roomChannels.length > 0 && sortedChannels.length === 0 && (
              <div className="empty-state channel-empty-state">
                <strong>필터 결과가 없습니다.</strong>
                <span>검색어, 상태, 정렬 조건을 다시 조정해보세요.</span>
                {hasChannelFilters && (
                  <button type="button" onClick={resetChannelFilters} data-smoke="channel-filter-reset">
                    필터 초기화
                  </button>
                )}
              </div>
            )}
            {sortedChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                users={state.users}
                currentUser={currentUser}
                selected={channel.id === selectedChannel?.id}
                onSelect={() => onSelectChannel(channel.id)}
                onJoin={() => onJoinChannel(channel.id, currentUser)}
                onSpectate={() => onSpectateChannel(channel.id, currentUser.id)}
              />
            ))}
          </div>
        </section>
      </section>

      <aside className="channel-inspector" data-smoke="channel-inspector">
        {selectedChannel ? (
          <ChannelDetail
            channel={selectedChannel}
            users={state.users}
            currentUser={currentUser}
            aiAppeals={state.aiAppeals}
            platformSettings={state.platformSettings}
            onSpectate={() => onSpectateChannel(selectedChannel.id, currentUser.id)}
            onLeave={() => onLeaveChannel(selectedChannel.id)}
            onStart={() => onStartDebate(selectedChannel.id)}
            onAdvancePhase={() => onAdvanceDebatePhase(selectedChannel.id)}
            onPassTurn={() => onPassTurn(selectedChannel.id)}
            onSetStance={(stance) => onSetParticipantStance(selectedChannel.id, currentUser.id, stance)}
            onSetReady={(ready) => onSetParticipantReady(selectedChannel.id, currentUser.id, ready)}
            onSetVoiceState={(voiceState) => onSetVoiceState(selectedChannel.id, currentUser.id, voiceState)}
            onMoveToVoting={() => onMoveToVoting(selectedChannel.id)}
            onAddDebateMessage={(body) => onAddDebateMessage(selectedChannel.id, body)}
            onAddSpectatorMessage={(body) => onAddSpectatorMessage(selectedChannel.id, body)}
            onReact={(targetUserId) => onSubmitReaction(selectedChannel.id, targetUserId)}
            onReport={(targetType, targetId, reason) =>
              onSubmitReport(targetType, targetId, selectedChannel.id, reason)
            }
            onSubmitAiAppeal={(reason) => onSubmitAiAppeal(selectedChannel.id, reason)}
            onVote={(targetUserId) => onSubmitVote(selectedChannel.id, targetUserId)}
            onFinalize={() => onFinalizeDebate(selectedChannel.id)}
            onDelete={() => onDeleteChannel(selectedChannel.id)}
            onRegenerateInviteCode={() => onUpdateInviteCode(selectedChannel.id, "regenerate")}
            onDisableInviteCode={() => onUpdateInviteCode(selectedChannel.id, "disable")}
            judging={judgingChannelId === selectedChannel.id}
            socketRef={socketRef}
          />
        ) : (
          <EmptyState title="채널을 선택하세요." body="관전하거나 참가할 토론 채널을 고르면 세부 화면이 열립니다." />
        )}
      </aside>
    </main>
  );
}

function ChannelComposer({
  currentUser,
  selectedRoom,
  defaultCoinStake,
  onCreateChannel,
}: {
  currentUser: User;
  selectedRoom: Room;
  defaultCoinStake: number;
  onCreateChannel: (
    roomId: string,
    title: string,
    visibility: ChannelVisibility,
    format: DebateFormat,
    coinStake: number,
  ) => Promise<ChannelActionResult>;
}) {
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("public");
  const [format, setFormat] = useState<DebateFormat>("text");
  const [coinStake, setCoinStake] = useState(defaultCoinStake);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCoinStake(defaultCoinStake);
  }, [defaultCoinStake]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError("");
    const result = await onCreateChannel(selectedRoom.id, title.trim(), visibility, format, coinStake);
    setCreating(false);
    if (!result.ok) {
      setError(result.message ?? "채널 생성에 실패했습니다.");
      return;
    }
    setTitle("");
    setVisibility("public");
    setFormat("text");
  };

  return (
    <form className="channel-composer" onSubmit={submit}>
      <label className="wide-field">
        새 토론 채널
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: 기본소득은 필요한가" />
      </label>
      <div className="segmented compact-control">
        <button type="button" className={visibility === "public" ? "active" : ""} onClick={() => setVisibility("public")}>
          <Users size={16} aria-hidden />
          공개
        </button>
        <button type="button" className={visibility === "private" ? "active" : ""} onClick={() => setVisibility("private")}>
          <Lock size={16} aria-hidden />
          비공개
        </button>
      </div>
      <div className="segmented compact-control">
        <button type="button" className={format === "text" ? "active" : ""} onClick={() => setFormat("text")}>
          <MessageSquare size={16} aria-hidden />
          채팅
        </button>
        <button type="button" className={format === "voice" ? "active" : ""} onClick={() => setFormat("voice")}>
          <Mic size={16} aria-hidden />
          음성
        </button>
      </div>
      <label className="stake-field">
        코인
        <input
          type="number"
          min={0}
          max={Math.max(0, currentUser.coins, defaultCoinStake)}
          step={10}
          value={coinStake}
          onChange={(event) => setCoinStake(Number(event.target.value))}
        />
      </label>
      <button className="primary-button fit-button" type="submit" disabled={creating}>
        <Plus size={18} aria-hidden />
        {creating ? "생성 중" : "생성"}
      </button>
      {error && <p className="form-error composer-error">{error}</p>}
    </form>
  );
}

function ChannelCard({
  channel,
  users,
  currentUser,
  selected,
  onSelect,
  onJoin,
  onSpectate,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  selected: boolean;
  onSelect: () => void;
  onJoin: () => void;
  onSpectate: () => void;
}) {
  const participants = channel.participantIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const canJoin =
    channel.visibility === "public" &&
    channel.status === "waiting" &&
    channel.participantIds.length < channel.participantLimit &&
    !channel.participantIds.includes(currentUser.id);
  const isParticipant = channel.participantIds.includes(currentUser.id);

  return (
    <article
      className={`channel-card ${selected ? "selected" : ""}`}
      data-smoke="channel-card"
      data-channel-id={channel.id}
      data-channel-format={channel.format}
      data-channel-status={channel.status}
      data-channel-visibility={channel.visibility}
      data-participant-count={channel.participantIds.length}
    >
      <button className="card-main" type="button" onClick={onSelect} data-smoke="channel-select">
        <div className="channel-title-row">
          <div>
            <h3>{channel.title}</h3>
            <div className="channel-tags" aria-label="채널 정보">
              <span className={channel.visibility === "public" ? "public" : "private"}>
                {channel.visibility === "public" ? <Globe2 size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                {channel.visibility === "public" ? "공개" : "비공개"}
              </span>
              <span>
                {channel.format === "text" ? <MessageSquare size={13} aria-hidden /> : <Mic size={13} aria-hidden />}
                {channel.format === "text" ? "채팅" : "음성"}
              </span>
              <span>
                <Flame size={13} aria-hidden />
                {phaseLabels[channel.phase]}
              </span>
              <span className="coin-tag">
                <Coins size={13} aria-hidden />
                {channel.coinStake}코인
              </span>
            </div>
          </div>
          <StatusPill status={channel.status} />
        </div>
        <div className="participant-preview">
          {Array.from({ length: channel.participantLimit }).map((_, index) => {
            const user = participants[index];
            if (!user) {
              return (
                <div className="participant-line empty-slot" key={`empty-${index}`}>
                  <div className="avatar placeholder-avatar" aria-hidden>
                    <UserRound size={16} />
                  </div>
                  <div>
                    <strong>대기 중</strong>
                    <span>두 번째 토론자를 기다립니다</span>
                  </div>
                </div>
              );
            }
            const snapshot = normalizeSnapshot(channel.participantSnapshots[user.id] ?? snapshotUser(user));
            return <ProfileLine key={user.id} snapshot={snapshot} />;
          })}
        </div>
      </button>
      <div className="card-actions">
        <span className="watch-count">
          <Eye size={15} aria-hidden />
          {channel.spectatorIds.length}
        </span>
        {isParticipant ? (
          <button type="button" onClick={onSelect} data-smoke="channel-enter">
            <Gavel size={15} aria-hidden />
            토론장
          </button>
        ) : canJoin ? (
          <button type="button" onClick={onJoin} data-smoke="channel-join">
            <UserRound size={15} aria-hidden />
            참가
          </button>
        ) : (
          <button type="button" onClick={onSpectate} data-smoke="channel-spectate">
            <Eye size={15} aria-hidden />
            관전
          </button>
        )}
      </div>
    </article>
  );
}

function channelParticipantSnapshot(channel: DebateChannel, users: User[], participantId?: string): ParticipantSnapshot | null {
  if (!participantId) return null;
  const user = users.find((item) => item.id === participantId);
  const snapshot = channel.participantSnapshots[participantId];
  if (!snapshot && !user) return null;
  return normalizeSnapshot(
    snapshot ?? {
      userId: participantId,
      displayName: user?.displayName ?? "참가자",
      title: user?.title ?? "",
      bio: user?.bio ?? "",
      photoUrl: user?.photoUrl ?? "",
      accentColor: user?.accentColor ?? defaultProfileStyle.accentColor,
      profileFrame: user?.profileFrame ?? defaultProfileStyle.profileFrame,
      bannerStyle: user?.bannerStyle ?? defaultProfileStyle.bannerStyle,
      featuredBadge: user?.featuredBadge ?? defaultProfileStyle.featuredBadge,
      claims: user?.claims ?? [],
      stats: user?.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
    },
  );
}

function DebateArchivePanel({
  channels,
  users,
  selectedChannelId,
  onSelectChannel,
}: {
  channels: DebateChannel[];
  users: User[];
  selectedChannelId?: string;
  onSelectChannel: (channelId: string) => void;
}) {
  const selectedArchive = channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const totalVotes = channels.reduce((total, channel) => total + channel.votes.length, 0);
  const totalMessages = channels.reduce((total, channel) => total + channel.debateMessages.length, 0);
  const selectedWinner = selectedArchive
    ? channelParticipantSnapshot(selectedArchive, users, selectedArchive.finalResult?.winnerId ?? selectedArchive.aiJudgement?.winnerId)
    : null;

  return (
    <section
      className={`archive-panel ${channels.length === 0 ? "empty" : ""}`}
      aria-label="종료 토론 아카이브"
      data-smoke="archive-panel"
      data-archive-count={channels.length}
    >
      <div className="archive-head">
        <div>
          <p className="eyebrow">종료 아카이브</p>
          <h3>{channels.length > 0 ? `${channels.length}개 토론 보관 중` : "아카이브 준비 중"}</h3>
        </div>
        <span>
          <Inbox size={15} aria-hidden />
          리플레이
        </span>
      </div>

      {channels.length === 0 ? (
        <p className="archive-empty-text">토론이 종료되고 AI 판정이 완료되면 결과, 발언 로그, 관전자 투표가 이곳에 자동 보관됩니다.</p>
      ) : (
        <>
          <div className="archive-metrics" aria-label="아카이브 요약">
            <span>
              <Trophy size={15} aria-hidden />
              <b>{channels.length}</b>
              경기
            </span>
            <span>
              <Vote size={15} aria-hidden />
              <b>{totalVotes}</b>
              투표
            </span>
            <span>
              <MessageSquare size={15} aria-hidden />
              <b>{totalMessages}</b>
              발언
            </span>
          </div>

          {selectedArchive && (
            <div className="archive-featured" data-smoke="archive-featured">
              <div>
                <strong>{selectedArchive.title}</strong>
                <span>
                  {selectedWinner ? `${selectedWinner.displayName} 승리` : "판정 결과 확인"} ·{" "}
                  {selectedArchive.finalResult?.resolvedAt ?? selectedArchive.aiJudgement?.decidedAt ?? selectedArchive.createdAt}
                </span>
              </div>
                <button type="button" onClick={() => onSelectChannel(selectedArchive.id)}>
                <Trophy size={15} aria-hidden />
                리플레이 열기
              </button>
            </div>
          )}

          <div className="archive-list">
            {channels.slice(0, 5).map((channel) => {
              const winner = channelParticipantSnapshot(channel, users, channel.finalResult?.winnerId ?? channel.aiJudgement?.winnerId);
              const isSelected = channel.id === selectedChannelId;
              const resolvedAt = channel.finalResult?.resolvedAt ?? channel.aiJudgement?.decidedAt ?? channel.createdAt;
              return (
                <button
                  className={isSelected ? "selected" : ""}
                  key={channel.id}
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                >
                  <span>
                    <strong>{channel.title}</strong>
                    <small>{resolvedAt}</small>
                  </span>
                  <em>{winner ? `${winner.displayName} 승` : "결과"}</em>
                  <b>
                    {channel.votes.length}표 · {channel.debateMessages.length}발언
                  </b>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ChannelDetail({
  channel,
  users,
  currentUser,
  aiAppeals,
  platformSettings,
  onSpectate,
  onLeave,
  onStart,
  onAdvancePhase,
  onPassTurn,
  onSetStance,
  onSetReady,
  onSetVoiceState,
  onMoveToVoting,
  onAddDebateMessage,
  onAddSpectatorMessage,
  onReact,
  onReport,
  onSubmitAiAppeal,
  onVote,
  onFinalize,
  onDelete,
  onRegenerateInviteCode,
  onDisableInviteCode,
  judging,
  socketRef,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  aiAppeals: AiAppealRecord[];
  platformSettings: PlatformSettings;
  onSpectate: () => void;
  onLeave: () => Promise<ActionResult>;
  onStart: () => Promise<ActionResult>;
  onAdvancePhase: () => Promise<ActionResult>;
  onPassTurn: () => Promise<ActionResult>;
  onSetStance: (stance: DebateStance) => Promise<ActionResult>;
  onSetReady: (ready: boolean) => Promise<ActionResult>;
  onSetVoiceState: (voiceState: Pick<VoiceState, "muted" | "handRaised">) => Promise<ActionResult>;
  onMoveToVoting: () => Promise<ActionResult>;
  onAddDebateMessage: (body: string) => Promise<ActionResult>;
  onAddSpectatorMessage: (body: string) => Promise<ActionResult>;
  onReact: (targetUserId: string) => Promise<ActionResult>;
  onReport: (targetType: ReportTargetType, targetId: string, reason: string) => Promise<ActionResult>;
  onSubmitAiAppeal: (reason: string) => Promise<ActionResult>;
  onVote: (targetUserId: string) => Promise<ActionResult>;
  onFinalize: () => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
  onRegenerateInviteCode: () => Promise<ActionResult>;
  onDisableInviteCode: () => Promise<ActionResult>;
  judging: boolean;
  socketRef: MutableRefObject<Socket | null>;
}) {
  const [debateInput, setDebateInput] = useState("");
  const [spectatorInput, setSpectatorInput] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [actionError, setActionError] = useState("");
  const [judgeError, setJudgeError] = useState("");
  const [debateSending, setDebateSending] = useState(false);
  const [spectatorSending, setSpectatorSending] = useState(false);
  const debateListRef = useRef<HTMLDivElement | null>(null);
  const spectatorListRef = useRef<HTMLDivElement | null>(null);
  const debateAtBottomRef = useRef(true);
  const spectatorAtBottomRef = useRef(true);
  const previousChannelIdRef = useRef(channel.id);
  const previousDebateCountRef = useRef(channel.debateMessages.length);
  const previousSpectatorCountRef = useRef(channel.spectatorMessages.length);
  const [newDebateCount, setNewDebateCount] = useState(0);
  const [newSpectatorCount, setNewSpectatorCount] = useState(0);
  const participants = channel.participantIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const allParticipantsReady =
    participants.length === channel.participantLimit &&
    channel.participantIds.every((participantId) => (channel.readyUserIds ?? []).includes(participantId));
  const isParticipant = channel.participantIds.includes(currentUser.id);
  const isSpectator = channel.spectatorIds.includes(currentUser.id);
  const canLeaveAsParticipant = isParticipant && channel.status === "waiting" && channel.phase === "ready";
  const canLeaveAsSpectator = isSpectator && !isParticipant;
  const canLeaveChannel = canLeaveAsParticipant || canLeaveAsSpectator;
  const currentVote = channel.votes.find((voteItem) => voteItem.voterId === currentUser.id);
  const hasVoted = Boolean(currentVote);
  const canVote = channel.status === "voting" && isSpectator && !isParticipant && !hasVoted;
  const votedUser = users.find((user) => user.id === currentVote?.targetUserId);
  const canFinalize = channel.status === "voting" && !channel.aiJudgement && (isParticipant || currentUser.role !== "member");
  const canManageChannel = currentUser.role === "admin" || currentUser.role === "moderator";
  const canManageInviteCode = channel.visibility === "private" && (channel.createdBy === currentUser.id || canManageChannel);
  const activeUser = users.find((user) => user.id === channel.activeSpeakerId);
  const currentUserRemaining = activeRemainingSeconds(channel, currentUser.id, nowMs);
  const maxDebateChars =
    channel.phase === "opening"
      ? platformSettings.debate.maxOpeningChars
      : platformSettings.debate.maxDebateChars;
  const canSpeak =
    channel.status === "live" &&
    isParticipant &&
    channel.activeSpeakerId === currentUser.id &&
    currentUserRemaining > 0;
  const phaseEnded =
    channel.status === "live" &&
    channel.phase !== "crossfire" &&
    Boolean(channel.phaseEndsAt) &&
    (channel.phaseEndsAt ?? 0) <= nowMs;

  useEffect(() => {
    if (channel.status !== "live") return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [channel.id, channel.status]);

  const scrollToListBottom = (element: HTMLDivElement | null) => {
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  };

  const updateScrollPin = (element: HTMLDivElement | null, targetRef: { current: boolean }) => {
    if (!element) return;
    targetRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 36;
  };

  const revealDebateMessages = () => {
    scrollToListBottom(debateListRef.current);
    debateAtBottomRef.current = true;
    setNewDebateCount(0);
  };

  const revealSpectatorMessages = () => {
    scrollToListBottom(spectatorListRef.current);
    spectatorAtBottomRef.current = true;
    setNewSpectatorCount(0);
  };

  useEffect(() => {
    const switchedChannel = previousChannelIdRef.current !== channel.id;
    const previousCount = previousDebateCountRef.current;
    const nextCount = channel.debateMessages.length;
    const newestMessage = channel.debateMessages[nextCount - 1];

    if (switchedChannel) {
      previousChannelIdRef.current = channel.id;
      previousDebateCountRef.current = nextCount;
      previousSpectatorCountRef.current = channel.spectatorMessages.length;
      debateAtBottomRef.current = true;
      spectatorAtBottomRef.current = true;
      setNewDebateCount(0);
      setNewSpectatorCount(0);
      window.requestAnimationFrame(() => {
        scrollToListBottom(debateListRef.current);
        scrollToListBottom(spectatorListRef.current);
      });
      return;
    }

    if (nextCount > previousCount) {
      const shouldAutoScroll =
        debateAtBottomRef.current || newestMessage?.authorId === currentUser.id || previousCount === 0;
      if (shouldAutoScroll) {
        window.requestAnimationFrame(revealDebateMessages);
      } else {
        setNewDebateCount((count) => count + nextCount - previousCount);
      }
    }
    previousDebateCountRef.current = nextCount;
  }, [channel.id, channel.debateMessages, channel.spectatorMessages.length, currentUser.id]);

  useEffect(() => {
    const previousCount = previousSpectatorCountRef.current;
    const nextCount = channel.spectatorMessages.length;
    const newestMessage = channel.spectatorMessages[nextCount - 1];

    if (nextCount > previousCount) {
      const shouldAutoScroll =
        spectatorAtBottomRef.current || newestMessage?.authorId === currentUser.id || previousCount === 0;
      if (shouldAutoScroll) {
        window.requestAnimationFrame(revealSpectatorMessages);
      } else {
        setNewSpectatorCount((count) => count + nextCount - previousCount);
      }
    }
    previousSpectatorCountRef.current = nextCount;
  }, [channel.spectatorMessages, currentUser.id]);

  const submitDebate = async (event: FormEvent) => {
    event.preventDefault();
    const body = debateInput.trim();
    if (!body || !canSpeak || body.length > maxDebateChars || debateSending) return;
    setActionError("");
    setDebateSending(true);
    const result = await onAddDebateMessage(body);
    setDebateSending(false);
    if (!result.ok) {
      setActionError(result.message ?? "발언 전송에 실패했습니다.");
      return;
    }
    setDebateInput("");
  };

  const submitSpectator = async (event: FormEvent) => {
    event.preventDefault();
    const body = spectatorInput.trim();
    if (!body || spectatorSending) return;
    if (body.length > MAX_SPECTATOR_CHARS) {
      setActionError(`관전 채팅은 ${MAX_SPECTATOR_CHARS}자 이내로 입력해주세요.`);
      return;
    }
    setActionError("");
    setSpectatorSending(true);
    const result = await onAddSpectatorMessage(body);
    setSpectatorSending(false);
    if (!result.ok) {
      setActionError(result.message ?? "관전 채팅 전송에 실패했습니다.");
      return;
    }
    setSpectatorInput("");
  };

  const runControlAction = async (action: () => Promise<ActionResult>, fallbackMessage: string) => {
    setActionError("");
    const result = await action();
    if (!result.ok) setActionError(result.message ?? fallbackMessage);
  };

  const copyInviteCode = async () => {
    if (!channel.inviteCode) return;
    setActionError("");
    try {
      await navigator.clipboard.writeText(channel.inviteCode);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1300);
    } catch {
      setActionError("입장 코드 복사에 실패했습니다. 직접 선택해서 복사해주세요.");
    }
  };

  const copyChannelLink = async () => {
    setActionError("");
    try {
      await navigator.clipboard.writeText(buildCurrentAppUrl("arena", channel.roomId, channel.id));
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1300);
    } catch {
      setActionError("채널 링크 복사에 실패했습니다. 주소창의 URL을 직접 복사해주세요.");
    }
  };

  const finalize = async () => {
    setJudgeError("");
    const result = await onFinalize();
    if (!result.ok) setJudgeError(result.message ?? "AI 판정에 실패했습니다.");
  };

  const voteStatusText = (() => {
    if (channel.status !== "voting") return "";
    if (judging) return "AI 판정이 진행 중입니다.";
    if (hasVoted) return `${votedUser?.displayName ?? "선택한 참가자"}에게 투표했습니다.`;
    if (isParticipant) return "참가자는 본인 토론에 투표하지 않습니다.";
    if (!isSpectator) return "관전 입장 후 투표할 수 있습니다.";
    return "관전자 투표가 진행 중입니다.";
  })();

  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">채널</p>
          <h2>{channel.title}</h2>
          <p>
            {channel.visibility === "private"
              ? channel.inviteCode
                ? `입장 코드 ${channel.inviteCode}`
                : "입장 코드 비활성화됨"
              : "공개 선착순"} · {phaseLabels[channel.phase]} · {channel.coinStake}코인
          </p>
        </div>
        <StatusPill status={channel.status} />
      </div>
      <div className="detail-quick-actions">
        <button className="invite-copy" type="button" onClick={copyChannelLink} data-smoke="channel-copy-link">
          <Copy size={16} aria-hidden />
          {linkCopied ? "링크 복사됨" : "채널 링크 복사"}
        </button>
        {channel.inviteCode && (
          <button className="invite-copy" type="button" onClick={copyInviteCode}>
            <Copy size={16} aria-hidden />
            {inviteCopied ? "코드 복사됨" : `${channel.inviteCode} 복사`}
          </button>
        )}
      </div>
      {canManageInviteCode && (
        <div className="channel-admin-panel" data-smoke="invite-code-manager">
          <div>
            <strong>입장 코드 관리</strong>
            <span>
              {channel.inviteCode
                ? "현재 코드가 활성 상태입니다."
                : "입장 코드가 비활성화되어 새 참가자가 코드로 들어올 수 없습니다."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void runControlAction(onRegenerateInviteCode, "입장 코드 재생성에 실패했습니다.");
            }}
            data-smoke="invite-code-regenerate"
          >
            <RefreshCw size={15} aria-hidden />
            {channel.inviteCode ? "재생성" : "활성화"}
          </button>
          <button
            type="button"
            onClick={() => {
              void runControlAction(onDisableInviteCode, "입장 코드 비활성화에 실패했습니다.");
            }}
            disabled={!channel.inviteCode}
            data-smoke="invite-code-disable"
          >
            <Lock size={15} aria-hidden />
            비활성화
          </button>
        </div>
      )}
      <button
        className="report-button"
        type="button"
        onClick={() => {
          void runControlAction(() => onReport("channel", channel.id, "채널 신고"), "신고 접수에 실패했습니다.");
        }}
      >
        채널 신고
      </button>

      {canManageChannel && (
        <div className="channel-admin-panel">
          <div>
            <strong>채널 관리</strong>
            <span>운영자 전용 정리 도구</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("이 채널을 삭제할까요? 삭제하면 토론 로그와 관전 채팅도 함께 사라집니다.")) return;
              void runControlAction(onDelete, "채널 삭제에 실패했습니다.");
            }}
            disabled={judging}
          >
            <Trash2 size={15} aria-hidden />
            삭제
          </button>
        </div>
      )}

      <div className="participant-duel">
        {participants.map((participant) => (
          <ParticipantProfile
            key={participant.id}
            snapshot={normalizeSnapshot(channel.participantSnapshots[participant.id] ?? snapshotUser(participant))}
          />
        ))}
        {participants.length < 2 && (
          <div className="participant-profile empty-profile">
            <div className="avatar placeholder-avatar" aria-hidden>
              <UserRound size={18} />
            </div>
            <strong>상대 대기</strong>
            <span>공개 채널은 선착순, 비공개 채널은 코드로 입장합니다.</span>
          </div>
        )}
      </div>

      <DebateFlowBoard
        channel={channel}
        users={users}
        currentUser={currentUser}
        nowMs={nowMs}
        onAdvancePhase={() => {
          void runControlAction(onAdvancePhase, "토론 단계 전환에 실패했습니다.");
        }}
        onPassTurn={() => {
          void runControlAction(onPassTurn, "턴 넘기기에 실패했습니다.");
        }}
        onSetStance={(stance) => {
          void runControlAction(() => onSetStance(stance), "스탠스 변경에 실패했습니다.");
        }}
        onSetReady={(ready) => {
          void runControlAction(() => onSetReady(ready), "준비 상태 변경에 실패했습니다.");
        }}
      />

      <OpinionGauge
        channel={channel}
        users={users}
        currentUser={currentUser}
        onReact={(targetUserId) => {
          void runControlAction(() => onReact(targetUserId), "공감 저장에 실패했습니다.");
        }}
      />

      <AudiencePanel channel={channel} users={users} currentUser={currentUser} />

      <div className="action-row">
        {!isParticipant && !isSpectator && (
          <button type="button" onClick={onSpectate} data-smoke="detail-spectate">
            <Eye size={17} aria-hidden />
            관전 입장
          </button>
        )}
        {canLeaveChannel && (
          <button
            className="leave-channel-button"
            type="button"
            onClick={() => {
              if (
                canLeaveAsParticipant &&
                !window.confirm("참가를 취소할까요? 대기방에서 빠지면 상대가 다시 입장할 때까지 토론을 시작할 수 없습니다.")
              ) {
                return;
              }
              void runControlAction(onLeave, "채널 나가기에 실패했습니다.");
            }}
            data-smoke="leave-channel"
          >
            <LogOut size={17} aria-hidden />
            {canLeaveAsParticipant ? "참가 취소" : "관전 퇴장"}
          </button>
        )}
        {channel.status === "waiting" &&
          isParticipant &&
          participants.length === channel.participantLimit &&
          !allParticipantsReady && (
            <button type="button" disabled>
              <CircleCheck size={17} aria-hidden />
              준비 대기
            </button>
          )}
        {channel.status === "waiting" && isParticipant && allParticipantsReady && (
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              void runControlAction(onStart, "토론 시작에 실패했습니다.");
            }}
            data-smoke="start-debate"
          >
            <Radio size={17} aria-hidden />
            토론 시작
          </button>
        )}
        {channel.status === "live" && isParticipant && currentUser.role !== "member" && (
          <button
            type="button"
            onClick={() => {
              void runControlAction(onMoveToVoting, "투표 단계 전환에 실패했습니다.");
            }}
          >
            <Vote size={17} aria-hidden />
            즉시 투표로
          </button>
        )}
        {canFinalize && (
          <button
            className="primary-button"
            type="button"
            onClick={finalize}
            disabled={judging}
            data-smoke="finalize-debate"
          >
            <Trophy size={17} aria-hidden />
            {judging ? "AI 판정 중" : "AI 최종 판정"}
          </button>
        )}
      </div>
      {actionError && <p className="form-error">{actionError}</p>}
      {judgeError && <p className="form-error">{judgeError}</p>}

      {channel.status === "finished" && channel.aiJudgement && channel.finalResult && (
        <DebateResultSummary
          channel={channel}
          users={users}
          currentUser={currentUser}
          aiAppeals={aiAppeals}
          onSubmitAiAppeal={onSubmitAiAppeal}
        />
      )}

      {channel.status === "finished" && (!channel.aiJudgement || !channel.finalResult) && (
        <div className="replay-banner">
          <Trophy size={18} aria-hidden />
          <div>
            <strong>종료된 토론</strong>
            <span>{channel.finalResult ? `${users.find((user) => user.id === channel.finalResult?.winnerId)?.displayName ?? "승자"} 승리` : "다시보기"}</span>
          </div>
        </div>
      )}

      {channel.status === "finished" && <DebateReplaySummary channel={channel} users={users} />}

      {(channel.debateMessages.length > 0 || channel.spectatorMessages.length > 0 || channel.votes.length > 0) && (
        <DebateExportPanel channel={channel} users={users} />
      )}

      {channel.format === "voice" && (
        <VoiceLobby
          channel={channel}
          users={users}
          currentUser={currentUser}
          socketRef={socketRef}
          onSetVoiceState={(voiceState) => {
            void runControlAction(() => onSetVoiceState(voiceState), "마이크 상태 변경에 실패했습니다.");
          }}
        />
      )}

      <section className="transcript-section">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">토론 로그</p>
            <h3>참가자 발언</h3>
          </div>
        </div>
        <div
          className="transcript"
          ref={debateListRef}
          onScroll={() => updateScrollPin(debateListRef.current, debateAtBottomRef)}
        >
          {channel.debateMessages.length === 0 && <EmptyState title="아직 발언이 없습니다." body="토론이 시작되면 발언 로그가 쌓입니다." />}
          {channel.debateMessages.map((message) => {
            const author = users.find((user) => user.id === message.authorId);
            return (
              <div className="speech-row" key={message.id} data-smoke="debate-message">
                {author && <Avatar user={author} />}
                <div>
                  <strong>{author?.displayName ?? "알 수 없음"}</strong>
                  <p>{message.body}</p>
                  <div className="message-meta">
                    <time>{message.phase ? `${phaseLabels[message.phase]} · ${message.createdAt}` : message.createdAt}</time>
                    <button
                      type="button"
                      onClick={() => {
                        void runControlAction(
                          () => onReport("debate_message", message.id, "토론 발언 신고"),
                          "신고 접수에 실패했습니다.",
                        );
                      }}
                    >
                      신고
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {newDebateCount > 0 && (
          <button className="new-message-button" type="button" onClick={revealDebateMessages}>
            새 발언 {newDebateCount}개
          </button>
        )}
        {channel.status === "live" && isParticipant && (
          <form className="inline-composer" onSubmit={submitDebate} data-smoke="debate-composer">
            <input
              value={debateInput}
              onChange={(event) => setDebateInput(event.target.value)}
              maxLength={maxDebateChars}
              disabled={!canSpeak || debateSending}
              data-smoke="debate-input"
              placeholder={
                canSpeak
                  ? `${phaseLabels[channel.phase]} 발언 입력 · ${maxDebateChars}자 이내`
                  : activeUser
                    ? `${activeUser.displayName} 발언권입니다`
                    : "발언 대기 중"
              }
            />
            <button
              type="submit"
              title="발언 보내기"
              disabled={!canSpeak || !debateInput.trim() || debateSending}
              data-smoke="debate-send"
            >
              <Send size={17} aria-hidden />
            </button>
          </form>
        )}
      </section>

      <section className="vote-section">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">판정</p>
            <h3>관전자 투표 + AI 분석</h3>
          </div>
        </div>
        {voteStatusText && (
          <div
            className={`vote-status-card ${hasVoted ? "done" : ""} ${judging ? "loading" : ""}`}
            data-smoke="vote-status"
            data-vote-state={hasVoted ? "done" : canVote ? "open" : "blocked"}
          >
            {judging ? <Brain size={17} aria-hidden /> : hasVoted ? <CircleCheck size={17} aria-hidden /> : <Vote size={17} aria-hidden />}
            <span>{voteStatusText}</span>
          </div>
        )}
        {channel.status === "voting" && (
          <div className="vote-grid" data-smoke="vote-grid">
            {participants.map((participant) => {
              const selected = currentVote?.targetUserId === participant.id;
              return (
              <button
                key={participant.id}
                type="button"
                className={selected ? "selected" : ""}
                title={selected ? `${participant.displayName} 내 선택` : `${participant.displayName} 투표`}
                disabled={!canVote}
                data-smoke="vote-option"
                data-target-user-id={participant.id}
                onClick={() => {
                  void runControlAction(() => onVote(participant.id), "투표에 실패했습니다.");
                }}
              >
                {selected ? <CircleCheck size={16} aria-hidden /> : <Vote size={16} aria-hidden />}
                {participant.displayName} 선택
              </button>
              );
            })}
          </div>
        )}
        {judging && (
          <div className="judge-loading">
            <span aria-hidden />
            <div>
              <strong>AI 판정 중</strong>
              <small>투표와 발언 로그를 종합하고 있습니다.</small>
            </div>
          </div>
        )}
        {channel.status !== "finished" && <VoteBars channel={channel} users={users} />}
        {channel.status !== "finished" && channel.aiJudgement && <AiResult channel={channel} users={users} />}
      </section>

      <section className="spectator-section">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">관전 채팅</p>
            <h3>{channel.spectatorIds.length}명 시청 중</h3>
          </div>
        </div>
        <div
          className="spectator-chat"
          ref={spectatorListRef}
          onScroll={() => updateScrollPin(spectatorListRef.current, spectatorAtBottomRef)}
        >
          {channel.spectatorMessages.length === 0 && <p className="quiet-text">관전 채팅이 아직 없습니다.</p>}
          {channel.spectatorMessages.map((message) => {
            const author = users.find((user) => user.id === message.authorId);
            return (
              <p
                className={`spectator-chat-row ${message.authorId === currentUser.id ? "self" : ""} ${
                  channel.participantIds.includes(message.authorId) ? "participant" : ""
                }`}
                key={message.id}
              >
                <strong>{author?.displayName ?? "관전자"}</strong>
                <small className="chat-role">{getChatAuthorLabel(channel, author, currentUser.id)}</small>
                <span>{message.body}</span>
                <button
                  type="button"
                  onClick={() => {
                    void runControlAction(
                      () => onReport("spectator_message", message.id, "관전 채팅 신고"),
                      "신고 접수에 실패했습니다.",
                    );
                  }}
                >
                  신고
                </button>
              </p>
            );
          })}
        </div>
        {newSpectatorCount > 0 && (
          <button className="new-message-button" type="button" onClick={revealSpectatorMessages}>
            새 채팅 {newSpectatorCount}개
          </button>
        )}
        {(isSpectator || isParticipant) && channel.status !== "finished" && (
          <form className="inline-composer" onSubmit={submitSpectator}>
            <input
              value={spectatorInput}
              onChange={(event) => setSpectatorInput(event.target.value)}
              maxLength={MAX_SPECTATOR_CHARS}
              disabled={spectatorSending}
              placeholder="관전 채팅 입력"
            />
            <button type="submit" title="채팅 보내기" disabled={!spectatorInput.trim() || spectatorSending}>
              <Send size={17} aria-hidden />
            </button>
          </form>
        )}
      </section>
    </section>
  );
}

function voiceDeviceErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정에서 마이크를 허용한 뒤 다시 연결해주세요.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "사용 가능한 마이크를 찾지 못했습니다. 기기를 연결한 뒤 다시 시도해주세요.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인한 뒤 다시 연결해주세요.";
    }
  }
  return error instanceof Error ? error.message : "음성 연결에 실패했습니다.";
}

function VoiceLobby({
  channel,
  users,
  currentUser,
  socketRef,
  onSetVoiceState,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  socketRef: MutableRefObject<Socket | null>;
  onSetVoiceState: (voiceState: Pick<VoiceState, "muted" | "handRaised">) => void;
}) {
  const participants = channel.participantIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const isParticipant = channel.participantIds.includes(currentUser.id);
  const currentVoice = normalizeVoiceState(channel.voiceStateByUser?.[currentUser.id]);
  const [connectionStatus, setConnectionStatus] = useState<VoiceConnectionStatus>("idle");
  const [voicePeers, setVoicePeers] = useState<VoicePeer[]>([]);
  const [voiceError, setVoiceError] = useState("");
  const [peerLeftNotice, setPeerLeftNotice] = useState("");
  const [localTrackMuted, setLocalTrackMuted] = useState(true);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const targetPeerIdRef = useRef("");
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const forcedMuted =
    channel.status === "live" &&
    Boolean(channel.activeSpeakerId) &&
    channel.activeSpeakerId !== currentUser.id;
  const canControlVoice = isParticipant && channel.status !== "finished";
  const canConnectVoice = canControlVoice && participants.length >= 2;
  const activeUser = users.find((user) => user.id === channel.activeSpeakerId);
  const liveCount = participants.filter((participant) => {
    const voiceState = normalizeVoiceState(channel.voiceStateByUser?.[participant.id]);
    return !voiceState.muted && (channel.status !== "live" || channel.activeSpeakerId === participant.id);
  }).length;
  const remotePeer = users.find((user) => user.id === targetPeerIdRef.current) ?? users.find((user) => voicePeers.some((peer) => peer.userId === user.id));
  const voiceStatusText: Record<VoiceConnectionStatus, string> = {
    idle: "아직 연결하지 않았습니다.",
    joining: "마이크 권한과 음성 룸을 준비 중입니다.",
    ready: voicePeers.length > 0 ? "상대 연결 신호를 기다리고 있습니다." : "상대 참가자가 음성 연결을 누르면 이어집니다.",
    calling: `${remotePeer?.displayName ?? "상대"}에게 연결 신호를 보내는 중입니다.`,
    reconnecting: "음성 연결이 끊겨 재연결을 기다리고 있습니다.",
    connected: `${remotePeer?.displayName ?? "상대"}와 음성 연결됨`,
    error: "음성 연결을 다시 시도해주세요.",
  };
  const voiceConnectionLabels: Record<VoiceConnectionStatus, string> = {
    idle: "미연결",
    joining: "권한 확인 중",
    ready: "상대 대기",
    calling: "연결 중",
    reconnecting: "재연결 중",
    connected: "연결됨",
    error: "확인 필요",
  };
  const micStateLabel = forcedMuted
    ? "발언권 대기"
    : currentVoice.muted
      ? "음소거 설정"
      : localTrackMuted
        ? "기기 대기"
        : "송출 중";
  const handStateLabel = currentVoice.handRaised ? "손들기 요청 중" : "요청 없음";

  const sendVoiceSignal = (toUserId: string, payload: Omit<VoiceSignalPayload, "channelId" | "fromUserId">) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("voice:signal", {
      channelId: channel.id,
      toUserId,
      ...payload,
    });
  };

  const closeVoiceConnection = (notifyServer = true) => {
    const socket = socketRef.current;
    if (notifyServer && socket) {
      socket.emit("voice:leave", { channelId: channel.id });
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    targetPeerIdRef.current = "";
    setVoicePeers([]);
    setConnectionStatus("idle");
    setLocalTrackMuted(true);
    setPeerLeftNotice("");
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("이 브라우저는 마이크 연결을 지원하지 않습니다.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !(currentVoice.muted || forcedMuted);
    });
    setLocalTrackMuted(currentVoice.muted || forcedMuted);
    return stream;
  };

  const ensurePeerConnection = async (peerId: string) => {
    if (peerConnectionRef.current && targetPeerIdRef.current === peerId) return peerConnectionRef.current;
    peerConnectionRef.current?.close();
    targetPeerIdRef.current = peerId;
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const stream = await ensureLocalStream();
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendVoiceSignal(peerId, {
        type: "candidate",
        candidate: event.candidate.toJSON(),
      });
    };
    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      setConnectionStatus("connected");
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "connected") {
        setConnectionStatus("connected");
        setVoiceError("");
        setPeerLeftNotice("");
      }
      if (peerConnection.connectionState === "disconnected") {
        setConnectionStatus("reconnecting");
        setVoiceError("피어 연결이 끊겼습니다. 잠시 기다리거나 음성 연결을 다시 눌러주세요.");
      }
      if (peerConnection.connectionState === "failed") {
        setConnectionStatus("error");
        setVoiceError("피어 연결에 실패했습니다. 연결 종료 후 다시 시도해주세요.");
      }
    };
    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const startOffer = async (peerId: string) => {
    setVoiceError("");
    setConnectionStatus("calling");
    const peerConnection = await ensurePeerConnection(peerId);
    const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
    await peerConnection.setLocalDescription(offer);
    sendVoiceSignal(peerId, {
      type: "offer",
      description: offer,
    });
  };

  const startVoiceConnection = async () => {
    const socket = socketRef.current;
    if (!socket) {
      setVoiceError("실시간 서버에 아직 연결되지 않았습니다.");
      setConnectionStatus("error");
      return;
    }
    if (!canConnectVoice) {
      setVoiceError("두 참가자가 모두 입장한 음성 채널에서 사용할 수 있습니다.");
      return;
    }
    try {
      setVoiceError("");
      setPeerLeftNotice("");
      setConnectionStatus("joining");
      await ensureLocalStream();
      if (currentVoice.muted && !forcedMuted) {
        onSetVoiceState({ muted: false, handRaised: currentVoice.handRaised });
        localStreamRef.current?.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setLocalTrackMuted(false);
      }
      const response = await new Promise<VoiceJoinResponse>((resolve) => {
        socket.emit("voice:join", { channelId: channel.id }, resolve);
      });
      if (!response.ok) {
        throw new Error(channelErrorMessages[response.error ?? ""] ?? "음성 룸에 입장할 수 없습니다.");
      }
      const peers = response.peers ?? [];
      setVoicePeers(peers);
      setConnectionStatus("ready");
      const firstPeer = peers.find((peer) => peer.userId !== currentUser.id);
      if (firstPeer) await startOffer(firstPeer.userId);
    } catch (error) {
      setVoiceError(voiceDeviceErrorMessage(error));
      setConnectionStatus("error");
    }
  };

  useEffect(() => {
    const muted = currentVoice.muted || forcedMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setLocalTrackMuted(muted);
  }, [currentVoice.muted, forcedMuted]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handlePeerJoined = (peer: VoicePeer & { channelId?: string }) => {
      if (peer.channelId !== channel.id || peer.userId === currentUser.id) return;
      setPeerLeftNotice("");
      setVoicePeers((previous) =>
        previous.some((item) => item.userId === peer.userId) ? previous : [...previous, peer],
      );
    };

    const handlePeerLeft = (payload: { channelId?: string; userId?: string }) => {
      if (payload.channelId !== channel.id) return;
      const leftUser = users.find((user) => user.id === payload.userId);
      setVoicePeers((previous) => previous.filter((peer) => peer.userId !== payload.userId));
      if (payload.userId && targetPeerIdRef.current === payload.userId) {
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
        targetPeerIdRef.current = "";
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        setPeerLeftNotice(`${leftUser?.displayName ?? "상대"}가 음성 연결에서 나갔습니다. 다시 연결을 기다리거나 텍스트 토론으로 이어가세요.`);
        setConnectionStatus("ready");
      }
    };

    const handleSignal = async (payload: VoiceSignalPayload) => {
      if (payload.channelId !== channel.id || payload.fromUserId === currentUser.id) return;
      try {
        setVoiceError("");
        if (payload.type === "offer" && payload.description) {
          const peerConnection = await ensurePeerConnection(payload.fromUserId);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          sendVoiceSignal(payload.fromUserId, {
            type: "answer",
            description: answer,
          });
          setConnectionStatus("calling");
        }
        if (payload.type === "answer" && payload.description && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.description));
          setConnectionStatus("connected");
        }
        if (payload.type === "candidate" && payload.candidate && peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (error) {
        setVoiceError(voiceDeviceErrorMessage(error));
        setConnectionStatus("error");
      }
    };

    socket.on("voice:peer-joined", handlePeerJoined);
    socket.on("voice:peer-left", handlePeerLeft);
    socket.on("voice:signal", handleSignal);
    return () => {
      socket.off("voice:peer-joined", handlePeerJoined);
      socket.off("voice:peer-left", handlePeerLeft);
      socket.off("voice:signal", handleSignal);
    };
  }, [channel.id, connectionStatus, currentUser.id, socketRef, users]);

  useEffect(() => {
    return () => {
      closeVoiceConnection(true);
    };
  }, [channel.id, currentUser.id]);

  return (
    <section
      className="voice-lobby"
      data-smoke="voice-lobby"
      data-channel-id={channel.id}
      data-channel-format={channel.format}
      data-voice-status={channel.status}
      data-can-connect={canConnectVoice}
      data-participant-count={participants.length}
      data-live-count={liveCount}
      data-current-user-id={currentUser.id}
      data-local-muted={currentVoice.muted || forcedMuted}
      data-hand-raised={currentVoice.handRaised}
    >
      <div className="voice-lobby-head">
        <div>
          <p className="eyebrow">음성 대기실</p>
          <h3>{channel.status === "live" ? "발언권 기반 마이크" : "마이크 준비"}</h3>
          <span>
            {activeUser
              ? `${activeUser.displayName} 발언권`
              : channel.status === "waiting"
                ? "참가자 입장 대기"
                : "음성 세션 대기"}
          </span>
        </div>
        <strong>
          <Radio size={15} aria-hidden />
          {liveCount}명 송출
        </strong>
      </div>

      <div className="voice-roster" data-smoke="voice-roster">
        {participants.map((participant) => {
          const voiceState = normalizeVoiceState(channel.voiceStateByUser?.[participant.id]);
          const isActive = channel.activeSpeakerId === participant.id;
          const isLive = !voiceState.muted && (channel.status !== "live" || isActive);
          return (
            <div
              className={`voice-person ${isActive ? "active" : ""} ${isLive ? "live" : ""}`}
              key={participant.id}
              data-smoke="voice-person"
              data-user-id={participant.id}
              data-muted={voiceState.muted}
              data-hand-raised={voiceState.handRaised}
              data-active-speaker={isActive}
              data-live={isLive}
            >
              <Avatar user={participant} />
              <div>
                <strong>{participant.displayName}</strong>
                <span>{isActive ? "현재 발언권" : voiceState.handRaised ? "손들기 요청" : "대기 중"}</span>
              </div>
              <em>
                {isLive ? <Mic size={15} aria-hidden /> : <MicOff size={15} aria-hidden />}
                {isLive ? "마이크 켜짐" : "음소거"}
              </em>
            </div>
          );
        })}
        {participants.length === 0 && <p className="quiet-text">음성 참가자가 아직 없습니다.</p>}
      </div>

      <div className="voice-status-grid" data-smoke="voice-status-grid">
        <span className={localTrackMuted ? "muted" : "live"}>
          <b>마이크</b>
          <em>{micStateLabel}</em>
        </span>
        <span className={currentVoice.handRaised ? "raised" : ""}>
          <b>손들기</b>
          <em>{handStateLabel}</em>
        </span>
        <span className={connectionStatus}>
          <b>연결</b>
          <em>{voiceConnectionLabels[connectionStatus]}</em>
        </span>
      </div>

      {canControlVoice ? (
        <div className="voice-controls" data-smoke="voice-controls">
          <button
            type="button"
            disabled={forcedMuted}
            data-smoke="voice-mic-toggle"
            data-muted={currentVoice.muted || forcedMuted}
            onClick={() =>
              onSetVoiceState({
                muted: forcedMuted ? true : !currentVoice.muted,
                handRaised: currentVoice.handRaised,
              })
            }
          >
            {currentVoice.muted || forcedMuted ? <Mic size={16} aria-hidden /> : <MicOff size={16} aria-hidden />}
            {forcedMuted ? "발언권 대기" : currentVoice.muted ? "마이크 켜기" : "음소거"}
          </button>
          <button
            type="button"
            className={currentVoice.handRaised ? "active" : ""}
            data-smoke="voice-hand-toggle"
            data-hand-raised={currentVoice.handRaised}
            onClick={() =>
              onSetVoiceState({
                muted: forcedMuted ? true : currentVoice.muted,
                handRaised: !currentVoice.handRaised,
              })
            }
          >
            <ThumbsUp size={16} aria-hidden />
            {currentVoice.handRaised ? "손 내리기" : "손들기"}
          </button>
        </div>
      ) : (
        <p className="voice-note">관전자는 마이크 상태를 볼 수 있고, 관전 채팅으로 반응할 수 있습니다.</p>
      )}

      {isParticipant && (
        <div
          className={`voice-call-panel ${connectionStatus}`}
          data-smoke="voice-call-panel"
          data-connection-status={connectionStatus}
          data-peer-count={voicePeers.length}
          data-can-connect={canConnectVoice}
          data-local-track-muted={localTrackMuted}
          data-target-peer-id={targetPeerIdRef.current}
        >
          <audio ref={remoteAudioRef} autoPlay playsInline data-smoke="voice-remote-audio" />
          <div>
            <strong>1대1 음성 연결</strong>
            <span>{voiceStatusText[connectionStatus]}</span>
            {voicePeers.length > 0 && (
              <small>
                연결 대기: {voicePeers.map((peer) => users.find((user) => user.id === peer.userId)?.displayName ?? peer.displayName ?? "상대").join(", ")}
              </small>
            )}
          </div>
          {peerLeftNotice && (
            <div className="voice-recovery" data-smoke="voice-recovery">
              <strong>상대방 이탈</strong>
              <span>{peerLeftNotice}</span>
            </div>
          )}
          <div className="voice-call-actions">
            {connectionStatus === "idle" || connectionStatus === "error" || connectionStatus === "reconnecting" || peerLeftNotice ? (
              <button type="button" disabled={!canConnectVoice} onClick={() => void startVoiceConnection()} data-smoke="voice-call-start">
                <Radio size={16} aria-hidden />
                {connectionStatus === "reconnecting" || peerLeftNotice ? "다시 연결" : "음성 연결"}
              </button>
            ) : (
              <button type="button" onClick={() => closeVoiceConnection(true)} data-smoke="voice-call-end">
                <MicOff size={16} aria-hidden />
                연결 종료
              </button>
            )}
            <em>{localTrackMuted ? "내 마이크 꺼짐" : "내 마이크 송출 중"}</em>
          </div>
          {voiceError && <p className="form-error" data-smoke="voice-error">{voiceError}</p>}
        </div>
      )}
    </section>
  );
}

function buildDebateExportText(channel: DebateChannel, users: User[]) {
  const participantLines = channel.participantIds.map((participantId) => {
    const snapshot = channelParticipantSnapshot(channel, users, participantId);
    const stance = stanceLabels[channel.stanceByUser[participantId] ?? "agree"];
    return `- ${snapshot?.displayName ?? "참가자"} (${stance}) · ${snapshot?.title ?? "프로필 없음"}`;
  });
  const voteLines = channel.participantIds.map((participantId) => {
    const snapshot = channelParticipantSnapshot(channel, users, participantId);
    const count = channel.votes.filter((vote) => vote.targetUserId === participantId).length;
    return `- ${snapshot?.displayName ?? "참가자"}: ${count}표`;
  });
  const debateLines = channel.debateMessages.map((message) => {
    const author = users.find((user) => user.id === message.authorId);
    const phaseLabel = message.phase ? phaseLabels[message.phase] : "토론";
    return `[${message.createdAt}] ${phaseLabel} · ${author?.displayName ?? "참가자"}\n${message.body}`;
  });
  const spectatorLines = channel.spectatorMessages.map((message) => {
    const author = users.find((user) => user.id === message.authorId);
    return `[${message.createdAt}] ${author?.displayName ?? "관전자"}: ${message.body}`;
  });
  const aiSummary = channel.aiJudgement
    ? [
        "AI 판정",
        `승자: ${channelParticipantSnapshot(channel, users, channel.aiJudgement.winnerId)?.displayName ?? "알 수 없음"}`,
        `요약: ${channel.aiJudgement.reasoning || "요약 없음"}`,
        ...channel.participantIds.map((participantId) => {
          const snapshot = channelParticipantSnapshot(channel, users, participantId);
          return `- ${snapshot?.displayName ?? "참가자"}: AI ${channel.aiJudgement?.userScores?.[participantId] ?? 0}점 · 최종 ${channel.aiJudgement?.finalScores?.[participantId] ?? 0}점`;
        }),
      ].join("\n")
    : "AI 판정: 아직 없음";

  return [
    "노수베스트 토론 로그",
    `채널: ${channel.title}`,
    `형식: ${channel.format === "voice" ? "음성" : "채팅"} · ${channel.visibility === "private" ? "비공개" : "공개"}`,
    `상태: ${statusLabels[channel.status]} · 단계: ${phaseLabels[channel.phase]}`,
    `생성: ${channel.createdAt}`,
    channel.finalResult?.resolvedAt ? `판정 완료: ${channel.finalResult.resolvedAt}` : "",
    "",
    "참가자",
    participantLines.length > 0 ? participantLines.join("\n") : "참가자 없음",
    "",
    "관전자 투표",
    voteLines.length > 0 ? voteLines.join("\n") : "투표 없음",
    "",
    aiSummary,
    "",
    "참가자 발언",
    debateLines.length > 0 ? debateLines.join("\n\n") : "발언 없음",
    "",
    "관전 채팅",
    spectatorLines.length > 0 ? spectatorLines.join("\n") : "채팅 없음",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function safeExportFileName(title: string) {
  const normalizedTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return `nosu-best-${normalizedTitle || "debate"}-log.txt`;
}

function DebateExportPanel({ channel, users }: { channel: DebateChannel; users: User[] }) {
  const [status, setStatus] = useState<"idle" | "copied" | "downloaded">("idle");
  const exportText = useMemo(() => buildDebateExportText(channel, users), [channel, users]);

  const flashStatus = (nextStatus: "copied" | "downloaded") => {
    setStatus(nextStatus);
    window.setTimeout(() => setStatus("idle"), 1400);
  };

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(exportText);
    flashStatus("copied");
  };

  const downloadTranscript = () => {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeExportFileName(channel.title);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    flashStatus("downloaded");
  };

  return (
    <section className="export-panel">
      <div>
        <p className="eyebrow">로그 내보내기</p>
        <h3>토론 기록 저장</h3>
        <span>
          발언 {channel.debateMessages.length}개 · 관전 채팅 {channel.spectatorMessages.length}개 · 투표 {channel.votes.length}표
        </span>
      </div>
      <div className="export-actions">
        <button type="button" onClick={copyTranscript}>
          <Copy size={16} aria-hidden />
          {status === "copied" ? "복사됨" : "전체 복사"}
        </button>
        <button type="button" onClick={downloadTranscript}>
          <Download size={16} aria-hidden />
          {status === "downloaded" ? "저장됨" : "TXT 저장"}
        </button>
      </div>
    </section>
  );
}

function DebateFlowBoard({
  channel,
  users,
  currentUser,
  nowMs,
  onAdvancePhase,
  onPassTurn,
  onSetStance,
  onSetReady,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  nowMs: number;
  onAdvancePhase: () => void;
  onPassTurn: () => void;
  onSetStance: (stance: DebateStance) => void;
  onSetReady: (ready: boolean) => void;
}) {
  const phaseOrder: DebatePhase[] = ["ready", "opening", "crossfire", "closing", "voting", "finished"];
  const phaseIndex = phaseOrder.indexOf(channel.phase);
  const participants = channel.participantIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const isParticipant = channel.participantIds.includes(currentUser.id);
  const readyUserIds = channel.readyUserIds ?? [];
  const currentUserReady = readyUserIds.includes(currentUser.id);
  const canSetReady =
    channel.status === "waiting" &&
    isParticipant &&
    participants.length === channel.participantLimit;
  const activeUser = users.find((user) => user.id === channel.activeSpeakerId);
  const [firstId] = channel.participantIds;
  const canControl = channel.status === "live" && isParticipant;
  const canPassTurn = canControl && channel.phase === "crossfire" && channel.activeSpeakerId === currentUser.id;
  const phaseEnded =
    channel.status === "live" &&
    channel.phase !== "crossfire" &&
    Boolean(channel.phaseEndsAt) &&
    (channel.phaseEndsAt ?? 0) <= nowMs;

  const nextLabel = (() => {
    if (channel.phase === "opening" && channel.activeSpeakerId === firstId) return "상대 기조 발언";
    if (channel.phase === "opening") return "크로스파이어 시작";
    if (channel.phase === "crossfire") return "최종 변론으로";
    if (channel.phase === "closing" && channel.activeSpeakerId === firstId) return "상대 최종 변론";
    if (channel.phase === "closing") return "투표 시작";
    return "다음 단계";
  })();

  return (
    <section
      className="debate-flow-board"
      data-smoke="debate-flow-board"
      data-channel-status={channel.status}
      data-phase={channel.phase}
      data-active-speaker-id={channel.activeSpeakerId ?? ""}
      data-debate-message-count={channel.debateMessages.length}
      data-vote-count={channel.votes.length}
    >
      <div className="flow-header">
        <div>
          <p className="eyebrow">토론 진행</p>
          <h3>{phaseLabels[channel.phase]}</h3>
          <span>
            {activeUser
              ? `${activeUser.displayName} 발언권`
              : channel.status === "waiting"
                ? "참가자 스탠스 확정 대기"
                : "발언권 없음"}
          </span>
        </div>
        {phaseEnded && <strong className="time-alert">시간 종료</strong>}
      </div>

      <div className="phase-steps" aria-label="토론 단계">
        {phaseOrder.map((phase, index) => (
          <span
            key={phase}
            className={`${phase === channel.phase ? "active" : ""} ${index < phaseIndex ? "done" : ""}`}
          >
            <i>{index < phaseIndex ? <Check size={12} aria-hidden /> : index + 1}</i>
            {phaseLabels[phase]}
          </span>
        ))}
      </div>

      {channel.status === "waiting" && (
        <div className="ready-roster" aria-label="참가자 준비 상태">
          {participants.map((participant) => {
            const ready = readyUserIds.includes(participant.id);
            return (
              <span key={participant.id} className={`ready-pill ${ready ? "ready" : ""}`}>
                {ready ? <CircleCheck size={14} aria-hidden /> : <Clock3 size={14} aria-hidden />}
                {participant.displayName}
                <b>{ready ? "준비 완료" : "대기"}</b>
              </span>
            );
          })}
          {participants.length < channel.participantLimit && (
            <span className="ready-pill empty">
              <UserRound size={14} aria-hidden />
              상대 대기
            </span>
          )}
        </div>
      )}

      <div className="clock-grid">
        {participants.map((participant) => {
          const remaining = activeRemainingSeconds(channel, participant.id, nowMs);
          const isActive = channel.activeSpeakerId === participant.id;
          const baseSeconds = getPhaseBaseSeconds(channel.phase);
          const timerProgress = Math.max(0, Math.min(100, (remaining / baseSeconds) * 100));
          return (
            <div
              className={`clock-card ${isActive ? "active" : ""}`}
              key={participant.id}
              style={{ "--timer-progress": `${timerProgress}%` } as CSSProperties}
            >
              <div>
                <strong>{participant.displayName}</strong>
                <span>{stanceLabels[channel.stanceByUser[participant.id] ?? "agree"]}</span>
              </div>
              <span className="timer-ring" aria-hidden>
                <Clock3 size={16} />
              </span>
              <b>{formatClock(remaining)}</b>
            </div>
          );
        })}
      </div>

      {channel.status === "waiting" && isParticipant && (
        <div className="stance-control">
          <span>내 스탠스</span>
          <div className="segmented compact-control">
            {(["agree", "disagree"] as const).map((stance) => (
              <button
                key={stance}
                type="button"
                className={channel.stanceByUser[currentUser.id] === stance ? "active" : ""}
                onClick={() => onSetStance(stance)}
              >
                {stanceLabels[stance]}
              </button>
            ))}
          </div>
          <button
            className={`ready-toggle ${currentUserReady ? "ready" : ""}`}
            type="button"
            onClick={() => onSetReady(!currentUserReady)}
            disabled={!canSetReady}
            data-smoke="ready-toggle"
            data-ready-state={currentUserReady ? "ready" : "waiting"}
          >
            {currentUserReady ? <CircleCheck size={16} aria-hidden /> : <Clock3 size={16} aria-hidden />}
            {participants.length < channel.participantLimit
              ? "상대 대기"
              : currentUserReady
                ? "준비 해제"
                : "준비 완료"}
          </button>
        </div>
      )}

      {canControl && (
        <div className="flow-actions">
          {canPassTurn && (
            <button type="button" onClick={onPassTurn} data-smoke="pass-turn">
              턴 넘기기
            </button>
          )}
          <button type="button" onClick={onAdvancePhase} data-smoke="advance-phase">
            {nextLabel}
          </button>
        </div>
      )}
    </section>
  );
}

function AudiencePanel({
  channel,
  users,
  currentUser,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
}) {
  const isParticipant = channel.participantIds.includes(currentUser.id);
  const isSpectator = channel.spectatorIds.includes(currentUser.id);
  const currentReaction = channel.reactions.find((reaction) => reaction.spectatorId === currentUser.id);
  const currentVote = channel.votes.find((voteItem) => voteItem.voterId === currentUser.id);
  const reactedUser = users.find((user) => user.id === currentReaction?.targetUserId);
  const votedUser = users.find((user) => user.id === currentVote?.targetUserId);
  const reactionLeader = channel.participantIds
    .map((participantId) => ({
      user: users.find((user) => user.id === participantId),
      count: channel.reactions.filter((reaction) => reaction.targetUserId === participantId).length,
    }))
    .sort((a, b) => b.count - a.count)[0];
  const audienceLabel = isParticipant ? "토론 참가 중" : isSpectator ? "관전 입장 완료" : "관전 입장 전";
  const voteLabel =
    currentVote
      ? `${votedUser?.displayName ?? "참가자"} 투표 완료`
      : channel.status === "voting" && isSpectator && !isParticipant
        ? "투표 가능"
        : "투표 대기";

  return (
    <section className="audience-panel">
      <div className="audience-head">
        <div>
          <p className="eyebrow">관전 모드</p>
          <h3>{audienceLabel}</h3>
        </div>
        <span className={isSpectator || isParticipant ? "online" : ""}>
          <Eye size={14} aria-hidden />
          {channel.spectatorIds.length}명
        </span>
      </div>
      <div className="audience-metrics">
        <span>
          <MessageSquare size={15} aria-hidden />
          <b>{channel.spectatorMessages.length}</b>
          채팅
        </span>
        <span>
          <ThumbsUp size={15} aria-hidden />
          <b>{channel.reactions.length}</b>
          공감
        </span>
        <span>
          <Vote size={15} aria-hidden />
          <b>{channel.votes.length}</b>
          투표
        </span>
      </div>
      <div className="audience-state">
        <span className={currentReaction ? "active" : ""}>
          {currentReaction ? `${reactedUser?.displayName ?? "참가자"} 공감 중` : "공감 선택 전"}
        </span>
        <span className={currentVote ? "active" : ""}>{voteLabel}</span>
        <span className={reactionLeader?.count ? "active" : ""}>
          {reactionLeader?.count ? `${reactionLeader.user?.displayName ?? "참가자"} 공감 우세` : "공감 집계 전"}
        </span>
      </div>
    </section>
  );
}

function OpinionGauge({
  channel,
  users,
  currentUser,
  onReact,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  onReact: (targetUserId: string) => void;
}) {
  const participants = channel.participantIds.map((id) => users.find((user) => user.id === id)).filter(Boolean) as User[];
  const total = Math.max(1, channel.reactions.length);
  const currentReaction = channel.reactions.find((reaction) => reaction.spectatorId === currentUser.id);
  const canReact =
    channel.status !== "finished" &&
    channel.spectatorIds.includes(currentUser.id) &&
    !channel.participantIds.includes(currentUser.id);

  return (
    <section className="opinion-gauge">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">실시간 여론</p>
          <h3>관전 공감 게이지</h3>
        </div>
        <span>승패 반영 없음</span>
      </div>
      <div className="opinion-bars">
        {participants.map((participant) => {
          const count = channel.reactions.filter((reaction) => reaction.targetUserId === participant.id).length;
          const percent = Math.round((count / total) * 100);
          return (
            <div className="opinion-row" key={participant.id}>
              <span>{participant.displayName}</span>
              <div className="vote-track">
                <i style={{ width: `${percent}%` }} />
              </div>
              <b>{count}</b>
              <button
                type="button"
                className={currentReaction?.targetUserId === participant.id ? "active" : ""}
                onClick={() => onReact(participant.id)}
                disabled={!canReact}
              >
                <ThumbsUp size={14} aria-hidden />
                공감
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function getChatAuthorLabel(channel: DebateChannel, author: User | undefined, currentUserId: string) {
  if (!author) return "관전자";
  if (author.id === currentUserId) return "나";
  if (channel.participantIds.includes(author.id)) return "토론자";
  if (author.role === "admin") return "운영자";
  if (author.role === "moderator") return "운영진";
  return "관전자";
}

function ProfileView({
  currentUser,
  privacyRequests,
  onSave,
  onRequestClaimVerification,
  onChangePhone,
  onChangePassword,
  onDeactivateAccount,
  onExportData,
  onRequestPrivacyDeletion,
  onRefreshSession,
}: {
  currentUser: User;
  privacyRequests: PrivacyDeletionRequest[];
  onSave: (user: User) => Promise<ActionResult>;
  onRequestClaimVerification: (
    claimId: string,
    reason: string,
    evidenceText: string,
    evidenceUrl: string,
  ) => Promise<ActionResult>;
  onChangePhone: (phone: string) => Promise<AuthResult>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<AuthResult>;
  onDeactivateAccount: (password: string, confirmation: string, reason: string) => Promise<AuthResult>;
  onExportData: () => Promise<ActionResult>;
  onRequestPrivacyDeletion: (reason: string) => Promise<ActionResult>;
  onRefreshSession: () => Promise<SessionCheckResult>;
}) {
  const [draft, setDraft] = useState<User>(currentUser);
  const [claimLabel, setClaimLabel] = useState("학력");
  const [claimValue, setClaimValue] = useState("");
  const [claimEvidenceText, setClaimEvidenceText] = useState("");
  const [claimEvidenceUrl, setClaimEvidenceUrl] = useState("");
  const [claimRequestDrafts, setClaimRequestDrafts] = useState<Record<string, ClaimRequestDraft>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [phoneChangeValue, setPhoneChangeValue] = useState(currentUser.phone);
  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [deactivateConfirmation, setDeactivateConfirmation] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");
  const [privacyDeleteReason, setPrivacyDeleteReason] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [sessionCheck, setSessionCheck] = useState<SessionCheckResult | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingPhone, setChangingPhone] = useState(false);
  const [deactivatingAccount, setDeactivatingAccount] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [requestingPrivacyDeletion, setRequestingPrivacyDeletion] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [requestingClaimId, setRequestingClaimId] = useState("");
  const lastProfileUserIdRef = useRef(currentUser.id);

  useEffect(() => {
    setDraft(currentUser);
    setPhoneChangeValue(currentUser.phone);
    if (lastProfileUserIdRef.current !== currentUser.id) {
      lastProfileUserIdRef.current = currentUser.id;
      setProfileMessage("");
      setSecurityMessage("");
      setSessionCheck(null);
      setClaimEvidenceText("");
      setClaimEvidenceUrl("");
      setClaimRequestDrafts({});
      setDeactivatePassword("");
      setDeactivateConfirmation("");
      setDeactivateReason("");
      setPrivacyDeleteReason("");
    }
  }, [currentUser]);

  const refreshSession = async () => {
    setCheckingSession(true);
    const result = await onRefreshSession();
    setCheckingSession(false);
    setSessionCheck(result);
    if (!result.ok) {
      setSecurityMessage(result.message ?? "세션 확인에 실패했습니다.");
    }
    return result;
  };

  useEffect(() => {
    let active = true;
    setCheckingSession(true);
    onRefreshSession().then((result) => {
      if (!active) return;
      setSessionCheck(result);
      setCheckingSession(false);
      if (!result.ok) setSecurityMessage(result.message ?? "세션 확인에 실패했습니다.");
    });
    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const addClaim = () => {
    if (!claimValue.trim()) return;
    setDraft((previous) => ({
      ...previous,
      claims: [
        ...previous.claims,
        {
          id: uid("claim"),
          label: claimLabel,
          value: claimValue.trim(),
          status: "self_reported",
          evidenceText: claimEvidenceText.trim(),
          evidenceUrl: claimEvidenceUrl.trim(),
        },
      ],
    }));
    setClaimValue("");
    setClaimEvidenceText("");
    setClaimEvidenceUrl("");
    setProfileMessage("이력이 추가되었습니다. 저장하면 프로필에 반영됩니다.");
  };

  const removeClaim = (claimId: string) => {
    setDraft((previous) => ({
      ...previous,
      claims: previous.claims.filter((claim) => claim.id !== claimId),
    }));
    setProfileMessage("이력이 삭제되었습니다. 저장하면 프로필에 반영됩니다.");
  };

  const updateClaimRequestDraft = (claim: ProfileClaim, patch: Partial<ClaimRequestDraft>) => {
    setClaimRequestDrafts((previous) => {
      const current = previous[claim.id] ?? {
        reason: claim.submittedReason ?? "",
        evidenceText: claim.evidenceText ?? "",
        evidenceUrl: claim.evidenceUrl ?? "",
      };
      return { ...previous, [claim.id]: { ...current, ...patch } };
    });
  };

  const getClaimRequestDraft = (claim: ProfileClaim): ClaimRequestDraft =>
    claimRequestDrafts[claim.id] ?? {
      reason: claim.submittedReason ?? "",
      evidenceText: claim.evidenceText ?? "",
      evidenceUrl: claim.evidenceUrl ?? "",
    };

  const requestVerification = async (claim: ProfileClaim) => {
    const requestDraft = getClaimRequestDraft(claim);
    const reason = requestDraft.reason.trim();
    const evidenceText = requestDraft.evidenceText.trim();
    const evidenceUrl = requestDraft.evidenceUrl.trim();
    if (!reason) {
      setProfileMessage("인증 요청 사유를 입력해주세요.");
      return;
    }
    setRequestingClaimId(claim.id);
    setProfileMessage("");
    const result = await onRequestClaimVerification(claim.id, reason, evidenceText, evidenceUrl);
    setRequestingClaimId("");
    if (!result.ok) {
      setProfileMessage(result.message ?? "인증 요청에 실패했습니다.");
      return;
    }
    setClaimRequestDrafts((previous) => {
      const next = { ...previous };
      delete next[claim.id];
      return next;
    });
    setProfileMessage("운영자 검토 대기 상태로 변경되었습니다.");
  };

  const uploadPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMessage("이미지 파일만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setProfileMessage("프로필 사진은 1MB 이하 이미지만 사용할 수 있습니다.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((previous) => ({ ...previous, photoUrl: String(reader.result ?? "") }));
      setProfileMessage("사진이 적용되었습니다. 저장하면 프로필에 반영됩니다.");
    };
    reader.onerror = () => {
      setProfileMessage("사진을 읽지 못했습니다. 다른 이미지를 선택해주세요.");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const saveProfile = async () => {
    const displayName = draft.displayName.trim();
    const title = draft.title.trim();
    if (!displayName) {
      setProfileMessage("닉네임을 입력해주세요.");
      return;
    }
    if (!title) {
      setProfileMessage("대표 타이틀을 입력해주세요.");
      return;
    }
    setSavingProfile(true);
    setProfileMessage("");
    const result = await onSave({
      ...draft,
      displayName,
      title,
      bio: draft.bio.trim(),
      featuredBadge: draft.featuredBadge.trim() || "신규 토론러",
      claims: draft.claims.map((claim) => ({
        ...claim,
        label: claim.label.trim(),
        value: claim.value.trim(),
      })),
    });
    setSavingProfile(false);
    if (!result.ok) {
      setProfileMessage(result.message ?? "프로필 저장에 실패했습니다.");
      return;
    }
    setProfileMessage("프로필이 저장되었습니다.");
  };

  const changePassword = async () => {
    setSecurityMessage("");
    if (draft.authProvider !== "local") {
      setSecurityMessage("간편 로그인 계정은 이 화면에서 비밀번호를 변경할 수 없습니다.");
      return;
    }
    if (newPassword.length < 6) {
      setSecurityMessage("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setSecurityMessage("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setChangingPassword(true);
    const result = await onChangePassword(currentPassword, newPassword);
    setChangingPassword(false);
    if (!result.ok) {
      setSecurityMessage(result.message ?? "비밀번호 변경에 실패했습니다.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setSecurityMessage("비밀번호가 변경되었습니다.");
  };

  const changePhone = async () => {
    setSecurityMessage("");
    const nextPhone = phoneChangeValue.trim();
    if (!/^010-?\d{4}-?\d{4}$/.test(nextPhone)) {
      setSecurityMessage("전화번호는 010-0000-0000 형식으로 입력해주세요.");
      return;
    }
    setChangingPhone(true);
    const result = await onChangePhone(nextPhone);
    setChangingPhone(false);
    if (!result.ok) {
      setSecurityMessage(result.message ?? "전화번호 변경에 실패했습니다.");
      return;
    }
    setSecurityMessage("전화번호가 변경되었습니다. 새 번호 인증을 완료해주세요.");
  };

  const deactivateAccount = async () => {
    setSecurityMessage("");
    if (deactivateConfirmation.trim() !== "탈퇴") {
      setSecurityMessage("탈퇴 확인 문구에 '탈퇴'를 입력해주세요.");
      return;
    }
    if (currentUser.authProvider === "local" && !deactivatePassword) {
      setSecurityMessage("현재 비밀번호를 입력해주세요.");
      return;
    }
    setDeactivatingAccount(true);
    const result = await onDeactivateAccount(deactivatePassword, deactivateConfirmation.trim(), deactivateReason.trim());
    setDeactivatingAccount(false);
    if (!result.ok) {
      setSecurityMessage(result.message ?? "계정 탈퇴 처리에 실패했습니다.");
      return;
    }
    setSecurityMessage("계정이 탈퇴 처리되었습니다.");
  };

  const exportData = async () => {
    setSecurityMessage("");
    setExportingData(true);
    const result = await onExportData();
    setExportingData(false);
    setSecurityMessage(result.ok ? "내 데이터 파일을 내려받았습니다." : result.message ?? "내 데이터 다운로드에 실패했습니다.");
  };

  const requestPrivacyDelete = async () => {
    setSecurityMessage("");
    setRequestingPrivacyDeletion(true);
    const result = await onRequestPrivacyDeletion(privacyDeleteReason.trim());
    setRequestingPrivacyDeletion(false);
    if (!result.ok) {
      setSecurityMessage(result.message ?? "삭제 요청 접수에 실패했습니다.");
      return;
    }
    setPrivacyDeleteReason("");
    setSecurityMessage("개인정보 삭제 요청이 운영자 큐에 접수되었습니다.");
  };

  const sessionRemainingMinutes =
    typeof sessionCheck?.expiresInSeconds === "number"
      ? Math.max(0, Math.ceil(sessionCheck.expiresInSeconds / 60))
      : null;
  const sessionExpiryLabel = sessionCheck?.expiresAt
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(sessionCheck.expiresAt))
    : "확인 전";
  const sessionCheckedLabel = sessionCheck?.checkedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(sessionCheck.checkedAt))
    : "아직 확인하지 않음";
  const sessionTone = sessionCheck?.authenticated ? "good" : sessionCheck ? "warning" : "pending";
  const latestPrivacyRequest = privacyRequests.find((request) => request.userId === currentUser.id);
  const hasOpenPrivacyRequest = Boolean(latestPrivacyRequest && ["pending", "reviewing"].includes(latestPrivacyRequest.status));

  return (
    <main className="single-view" data-smoke="profile-view">
      <section className="profile-editor">
        <div className="section-heading">
          <div>
            <p className="eyebrow">공개 프로필</p>
            <h2>채널 입장 전 노출 정보</h2>
            <p>닉네임, 사진, 소개, 이력은 관전자들이 토론을 보기 전에 확인하는 핵심 정보입니다.</p>
          </div>
          <div className="profile-photo-stack">
            <Avatar user={draft} large />
            <label className="photo-upload-button">
              <ImageUp size={15} aria-hidden />
              사진 선택
              <input type="file" accept="image/*" onChange={uploadPhoto} />
            </label>
          </div>
        </div>
        <div className="profile-customizer">
          <div className="profile-preview-card">
            <p className="eyebrow">미리보기</p>
            <ParticipantProfile snapshot={snapshotUser(draft)} />
            <TrustMeter subject={draft} />
          </div>
          <div className="decoration-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">꾸미기</p>
                <h3>프로필 스타일</h3>
              </div>
              <Palette size={22} aria-hidden />
            </div>
            <div className="decor-control">
              <span>대표 색상</span>
              <div className="accent-picker">
                {accentOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`accent-swatch ${option.value} ${draft.accentColor === option.value ? "selected" : ""}`}
                    type="button"
                    title={option.label}
                    onClick={() => setDraft({ ...draft, accentColor: option.value })}
                  />
                ))}
              </div>
            </div>
            <div className="decor-control">
              <span>프레임</span>
              <div className="chip-selector">
                {frameOptions.map((option) => (
                  <button
                    key={option.value}
                    className={draft.profileFrame === option.value ? "selected" : ""}
                    type="button"
                    onClick={() => setDraft({ ...draft, profileFrame: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="decor-control">
              <span>배너</span>
              <div className="chip-selector">
                {bannerOptions.map((option) => (
                  <button
                    key={option.value}
                    className={draft.bannerStyle === option.value ? "selected" : ""}
                    type="button"
                    onClick={() => setDraft({ ...draft, bannerStyle: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              대표 배지
              <input
                value={draft.featuredBadge}
                onChange={(event) => setDraft({ ...draft, featuredBadge: event.target.value })}
                placeholder="예: 경제 토론 10승"
              />
            </label>
          </div>
        </div>
        <div className="profile-form-grid">
          <label>
            닉네임
            <input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} />
          </label>
          <label>
            대표 타이틀
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="full-span">
            프로필 사진 URL
            <div className="photo-url-row">
              <input value={draft.photoUrl} onChange={(event) => setDraft({ ...draft, photoUrl: event.target.value })} placeholder="https://..." />
              <button type="button" onClick={() => setDraft({ ...draft, photoUrl: "" })} disabled={!draft.photoUrl}>
                <Trash2 size={16} aria-hidden />
                제거
              </button>
            </div>
          </label>
          <label className="full-span">
            소개
            <textarea value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} rows={4} />
          </label>
        </div>
        <div className="claim-editor">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">이력</p>
              <h3>학력, 직업, 회사, 자격</h3>
            </div>
          </div>
          <div className="claim-list">
            {draft.claims.map((claim) => {
              const canRequest = claim.status === "self_reported" || claim.status === "rejected";
              const requestDraft = getClaimRequestDraft(claim);
              const evidenceUrl = claim.evidenceUrl?.trim();
              return (
                <div className="claim-row" key={claim.id}>
                  <div>
                    <strong>{claim.label}</strong>
                    <span>{claim.value}</span>
                    {claim.evidenceText && <small className="claim-review-note">증빙 메모: {claim.evidenceText}</small>}
                    {evidenceUrl && (
                      <a className="claim-review-note" href={evidenceUrl} target="_blank" rel="noreferrer">
                        증빙 링크 열기
                      </a>
                    )}
                    {claim.submittedReason && <small className="claim-review-note">제출 사유: {claim.submittedReason}</small>}
                    {claim.reviewMemo && <small className="claim-review-note">심사 메모: {claim.reviewMemo}</small>}
                    {claim.reviewerName && <small className="claim-review-note">심사자: {claim.reviewerName}</small>}
                  </div>
                  <VerificationBadge status={claim.status} />
                  {canRequest && (
                    <div className="claim-request-panel">
                      <textarea
                        value={requestDraft.reason}
                        onChange={(event) => updateClaimRequestDraft(claim, { reason: event.target.value })}
                        placeholder="운영자에게 전달할 인증 요청 사유"
                        rows={2}
                      />
                      <textarea
                        value={requestDraft.evidenceText}
                        onChange={(event) => updateClaimRequestDraft(claim, { evidenceText: event.target.value })}
                        placeholder="증빙 설명 또는 확인 가능한 텍스트"
                        rows={2}
                      />
                      <input
                        value={requestDraft.evidenceUrl}
                        onChange={(event) => updateClaimRequestDraft(claim, { evidenceUrl: event.target.value })}
                        placeholder="증빙 URL (선택)"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void requestVerification(claim);
                        }}
                        disabled={requestingClaimId === claim.id || !requestDraft.reason.trim()}
                      >
                        <BadgeCheck size={15} aria-hidden />
                        {requestingClaimId === claim.id ? "요청 중" : "인증 요청"}
                      </button>
                    </div>
                  )}
                  {claim.status === "pending" && <span className="claim-review-note">검토 대기</span>}
                  <button type="button" onClick={() => removeClaim(claim.id)}>
                    <Trash2 size={15} aria-hidden />
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
          <div className="claim-add-row">
            <select value={claimLabel} onChange={(event) => setClaimLabel(event.target.value)}>
              <option>학력</option>
              <option>직업</option>
              <option>회사</option>
              <option>자격</option>
              <option>관심 분야</option>
            </select>
            <input value={claimValue} onChange={(event) => setClaimValue(event.target.value)} placeholder="예: 서울대학교 경제학부" />
            <textarea
              value={claimEvidenceText}
              onChange={(event) => setClaimEvidenceText(event.target.value)}
              placeholder="증빙 설명 (선택)"
              rows={2}
            />
            <input
              value={claimEvidenceUrl}
              onChange={(event) => setClaimEvidenceUrl(event.target.value)}
              placeholder="증빙 URL (선택)"
            />
            <button type="button" onClick={addClaim}>
              <Plus size={17} aria-hidden />
              추가
            </button>
          </div>
        </div>
        <div className="account-security">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">계정 보안</p>
              <h3>전화번호와 비밀번호</h3>
            </div>
            <ShieldCheck size={22} aria-hidden />
          </div>
          <div
            className={`session-status-card ${sessionTone}`}
            data-smoke="session-status-card"
            data-session-authenticated={sessionCheck?.authenticated ? "true" : "false"}
            data-session-user-id={sessionCheck?.userId ?? ""}
            data-session-secure={sessionCheck?.secure ? "true" : "false"}
            data-session-same-site={sessionCheck?.sameSite ?? ""}
            data-session-expires-in={sessionCheck?.expiresInSeconds ?? ""}
            data-session-checked-at={sessionCheck?.checkedAt ?? ""}
          >
            <div className="session-status-main">
              <span className={`session-dot ${sessionTone}`} aria-hidden />
              <div>
                <strong>{sessionCheck?.authenticated ? "로그인 세션 정상" : sessionCheck ? "세션 재확인 필요" : "세션 확인 대기"}</strong>
                <small>
                  {sessionCheck?.authenticated
                    ? `${sessionCheck.displayName ?? currentUser.displayName} · ${roleLabels[sessionCheck.role ?? currentUser.role]}`
                    : sessionCheck?.message ?? "현재 브라우저 쿠키를 확인합니다."}
                </small>
              </div>
            </div>
            <div className="session-status-meta">
              <span>
                <Clock3 size={14} aria-hidden />
                만료 {sessionExpiryLabel}
              </span>
              <span>
                <KeyRound size={14} aria-hidden />
                {sessionRemainingMinutes === null ? "남은 시간 확인 전" : `${sessionRemainingMinutes.toLocaleString()}분 남음`}
              </span>
              <span>
                <ShieldCheck size={14} aria-hidden />
                SameSite {sessionCheck?.sameSite ?? "확인 전"} · {sessionCheck?.secure ? "Secure" : "Dev cookie"}
              </span>
            </div>
            <div className="session-status-actions">
              <small>마지막 확인 {sessionCheckedLabel}</small>
              <button type="button" onClick={refreshSession} disabled={checkingSession} data-smoke="session-refresh">
                <RefreshCw size={15} aria-hidden />
                {checkingSession ? "확인 중" : "세션 다시 확인"}
              </button>
            </div>
          </div>
          <div className="phone-change-box">
            <div>
              <span>현재 전화번호</span>
              <strong>{currentUser.phone || "미등록"}</strong>
              <small>{currentUser.phoneVerified ? "인증 완료" : "인증 대기"}</small>
            </div>
            <label>
              새 전화번호
              <input
                value={phoneChangeValue}
                onChange={(event) => setPhoneChangeValue(event.target.value)}
                placeholder="010-0000-0000"
                inputMode="tel"
              />
            </label>
            <button type="button" onClick={changePhone} disabled={changingPhone}>
              <Phone size={16} aria-hidden />
              {changingPhone ? "변경 중" : "번호 변경"}
            </button>
          </div>
          <div className="security-grid">
            <label>
              현재 비밀번호
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="현재 비밀번호"
                disabled={draft.authProvider !== "local"}
              />
            </label>
            <label>
              새 비밀번호
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="6자 이상"
                disabled={draft.authProvider !== "local"}
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                placeholder="한 번 더 입력"
                disabled={draft.authProvider !== "local"}
              />
            </label>
          </div>
          <div className="security-actions">
            <button type="button" onClick={changePassword} disabled={changingPassword}>
              {changingPassword ? "변경 중" : "비밀번호 변경"}
            </button>
            {securityMessage && (
              <span role="status" aria-live="polite">
                {securityMessage}
              </span>
            )}
          </div>
          <div className="danger-zone" data-smoke="privacy-request-panel">
            <div>
              <strong>개인정보 요청</strong>
              <p>내 계정 데이터 JSON을 내려받거나, 물리 삭제 전 운영자 검토 요청을 남길 수 있습니다.</p>
              {latestPrivacyRequest && (
                <small>
                  최근 삭제 요청: {privacyRequestStatusLabels[latestPrivacyRequest.status]} · {latestPrivacyRequest.createdAt}
                  {latestPrivacyRequest.reviewMemo ? ` · ${latestPrivacyRequest.reviewMemo}` : ""}
                </small>
              )}
            </div>
            <div className="danger-grid">
              <label>
                삭제 요청 사유
                <input
                  value={privacyDeleteReason}
                  onChange={(event) => setPrivacyDeleteReason(event.target.value)}
                  placeholder="선택 입력"
                  disabled={hasOpenPrivacyRequest}
                  data-smoke="privacy-delete-reason"
                />
              </label>
            </div>
            <div className="security-actions">
              <button type="button" onClick={exportData} disabled={exportingData} data-smoke="profile-data-export">
                <Download size={16} aria-hidden />
                {exportingData ? "내려받는 중" : "내 데이터 다운로드"}
              </button>
              <button
                type="button"
                onClick={requestPrivacyDelete}
                disabled={requestingPrivacyDeletion || hasOpenPrivacyRequest}
                data-smoke="privacy-delete-request"
              >
                <Trash2 size={16} aria-hidden />
                {hasOpenPrivacyRequest ? "요청 접수됨" : requestingPrivacyDeletion ? "접수 중" : "삭제 요청 접수"}
              </button>
            </div>
          </div>
          <div className="danger-zone">
            <div>
              <strong>계정 탈퇴</strong>
              <p>탈퇴하면 로그인과 토론 참여가 즉시 막히고, 기존 토론 기록에는 익명화된 계정으로 남습니다.</p>
            </div>
            <div className="danger-grid">
              {currentUser.authProvider === "local" && (
                <label>
                  현재 비밀번호
                  <input
                    type="password"
                    value={deactivatePassword}
                    onChange={(event) => setDeactivatePassword(event.target.value)}
                    placeholder="현재 비밀번호"
                  />
                </label>
              )}
              <label>
                탈퇴 사유
                <input
                  value={deactivateReason}
                  onChange={(event) => setDeactivateReason(event.target.value)}
                  placeholder="선택 입력"
                />
              </label>
              <label>
                확인 문구
                <input
                  value={deactivateConfirmation}
                  onChange={(event) => setDeactivateConfirmation(event.target.value)}
                  placeholder="탈퇴"
                />
              </label>
            </div>
            <button
              className="danger-button"
              type="button"
              onClick={deactivateAccount}
              disabled={deactivatingAccount}
            >
              <Trash2 size={16} aria-hidden />
              {deactivatingAccount ? "처리 중" : "계정 탈퇴"}
            </button>
          </div>
        </div>
        <div className="profile-save-row">
          <button className="primary-button" type="button" onClick={saveProfile} disabled={savingProfile}>
            <Check size={18} aria-hidden />
            {savingProfile ? "저장 중" : "프로필 저장"}
          </button>
          {profileMessage && (
            <span role="status" aria-live="polite">
              {profileMessage}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}

function RoomAdminRow({
  room,
  channelCount,
  canManage,
  canDelete,
  busyAction,
  onRunAction,
  onUpdateRoom,
  onDeleteRoom,
}: {
  room: Room;
  channelCount: number;
  canManage: boolean;
  canDelete: boolean;
  busyAction: string;
  onRunAction: (actionKey: string, action: () => Promise<ActionResult>, successMessage: string) => Promise<boolean>;
  onUpdateRoom: (roomId: string, title: string, topic: string) => Promise<ActionResult>;
  onDeleteRoom: (roomId: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [nextTitle, setNextTitle] = useState(room.title);
  const [nextTopic, setNextTopic] = useState(room.topic);
  const saving = busyAction === `room-save-${room.id}`;
  const deleting = busyAction === `room-delete-${room.id}`;
  const busy = Boolean(busyAction);

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    const title = nextTitle.trim();
    const topic = nextTopic.trim();
    if (!canManage || !title || !topic) return;
    const ok = await onRunAction(
      `room-save-${room.id}`,
      () => onUpdateRoom(room.id, title, topic),
      "주제 방을 수정했습니다.",
    );
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <form className="room-admin-row editing" onSubmit={submitEdit}>
        <label>
          방 이름
          <input
            value={nextTitle}
            onChange={(event) => setNextTitle(event.target.value)}
            maxLength={80}
            disabled={!canManage || saving}
          />
        </label>
        <label>
          토론 주제
          <input
            value={nextTopic}
            onChange={(event) => setNextTopic(event.target.value)}
            maxLength={180}
            disabled={!canManage || saving}
          />
        </label>
        <div className="room-admin-actions">
          <button type="submit" disabled={!canManage || saving || !nextTitle.trim() || !nextTopic.trim()}>
            {saving ? "저장 중" : "저장"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setNextTitle(room.title);
              setNextTopic(room.topic);
              setEditing(false);
            }}
          >
            취소
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className="room-admin-row">
      <div>
        <strong>{room.title}</strong>
        <span>{room.topic}</span>
        <small>
          {channelCount}개 채널 · {room.createdAt}
        </small>
      </div>
      {canManage && (
        <div className="room-admin-actions">
          <button type="button" disabled={busy} onClick={() => setEditing(true)}>
            수정
          </button>
          <button
            type="button"
            disabled={busy || !canDelete}
            onClick={() => {
              const warning =
                channelCount > 0
                  ? `${channelCount}개 채널도 함께 삭제됩니다. 이 주제 방을 삭제할까요?`
                  : "이 주제 방을 삭제할까요?";
              if (!window.confirm(warning)) return;
              void onRunAction(
                `room-delete-${room.id}`,
                () => onDeleteRoom(room.id),
                "주제 방을 삭제했습니다.",
              );
            }}
          >
            {deleting ? "삭제 중" : "삭제"}
          </button>
        </div>
      )}
    </article>
  );
}

function isSanctionActive(sanction: UserSanction, nowMs = Date.now()) {
  if (sanction.revokedAt) return false;
  if (sanction.expiresAt === undefined || sanction.expiresAt === null) {
    return sanction.type !== "suspension";
  }
  return Number(sanction.expiresAt) > nowMs;
}

function getActiveSuspension(state: AppState, userId: string, nowMs = Date.now()) {
  return (state.sanctions ?? []).find(
    (sanction) => sanction.userId === userId && sanction.type === "suspension" && isSanctionActive(sanction, nowMs),
  );
}

function formatSuspensionUntil(sanction?: UserSanction) {
  if (!sanction?.expiresAt) return "";
  return new Date(sanction.expiresAt).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSuspensionRemaining(sanction?: UserSanction, nowMs = Date.now()) {
  if (!sanction?.expiresAt) return "";
  const remainingMs = Number(sanction.expiresAt) - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "만료됨";
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${days}일 ${restHours}시간` : `${days}일`;
  }
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function suspensionActionMessage(sanction?: UserSanction) {
  if (!sanction) return "";
  const until = formatSuspensionUntil(sanction);
  const remaining = formatSuspensionRemaining(sanction);
  return `운영 제재로 토론 참여가 제한되어 있습니다.${remaining ? ` 남은 시간: ${remaining}.` : ""}${until ? ` 해제 예정: ${until}.` : ""}`;
}

function formatAuditMetadata(metadata?: Record<string, string>) {
  const entries = Object.entries(metadata ?? {}).filter(([, value]) => value).slice(0, 3);
  return entries.map(([key, value]) => `${key}: ${value}`).join(" · ");
}

function auditFiltersActive(filters: AuditLogFilter) {
  return Object.values(filters).some(Boolean);
}

function auditLogMatchesFilter(log: AuditLogEntry, filters: AuditLogFilter) {
  if (filters.action && log.action !== filters.action) return false;
  if (filters.targetType && log.targetType !== filters.targetType) return false;
  if (filters.actor) {
    const actorNeedle = filters.actor.toLowerCase();
    const actorText = `${log.actorId} ${log.actorName} ${log.actorRole}`.toLowerCase();
    if (!actorText.includes(actorNeedle)) return false;
  }
  if (filters.date) {
    const isoDate = (log.createdAtIso ?? "").slice(0, 10);
    if (isoDate !== filters.date && !log.createdAt.includes(filters.date)) return false;
  }
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = [
      log.id,
      log.action,
      log.actorName,
      log.actorRole,
      log.targetType,
      log.targetId,
      log.summary,
      formatAuditMetadata(log.metadata),
      log.createdAt,
      log.createdAtIso,
    ].join(" ").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function findReportTargetUser(report: ReportRecord, state: AppState) {
  if (report.targetType === "user") {
    return state.users.find((user) => user.id === report.targetId);
  }
  const channel = state.channels.find((item) => item.id === report.channelId || item.id === report.targetId);
  if (!channel) return undefined;
  if (report.targetType === "channel") {
    return state.users.find((user) => user.id === channel.createdBy);
  }
  const message =
    report.targetType === "debate_message"
      ? channel.debateMessages.find((item) => item.id === report.targetId)
      : channel.spectatorMessages.find((item) => item.id === report.targetId);
  return state.users.find((user) => user.id === message?.authorId);
}

function UserAdminRow({
  user,
  state,
  currentUser,
  busyAction,
  onRunAction,
  onSetUserRole,
  onSanctionUser,
  onRevokeSanction,
}: {
  user: User;
  state: AppState;
  currentUser: User;
  busyAction: string;
  onRunAction: (actionKey: string, action: () => Promise<ActionResult>, successMessage: string) => Promise<boolean>;
  onSetUserRole: (userId: string, role: Role) => Promise<ActionResult>;
  onSanctionUser: (
    userId: string,
    type: SanctionType,
    reason: string,
    durationHours?: number,
    reportId?: string,
  ) => Promise<ActionResult>;
  onRevokeSanction: (sanctionId: string, reason?: string) => Promise<ActionResult>;
}) {
  const activeSuspension = getActiveSuspension(state, user.id);
  const warningCount = (state.sanctions ?? []).filter(
    (sanction) => sanction.userId === user.id && sanction.type === "warning" && !sanction.revokedAt,
  ).length;
  const canSanction =
    currentUser.id !== user.id && (currentUser.role === "admin" || (currentUser.role === "moderator" && user.role === "member"));
  const busy = Boolean(busyAction);

  const requestSanction = (type: SanctionType) => {
    const reason = window.prompt(type === "warning" ? "경고 사유를 입력하세요." : "정지 사유를 입력하세요.");
    if (!reason?.trim()) return;
    void onRunAction(
      `sanction-${type}-${user.id}`,
      () => onSanctionUser(user.id, type, reason.trim(), type === "suspension" ? 24 : undefined),
      type === "warning" ? "경고를 부여했습니다." : "24시간 정지를 적용했습니다.",
    );
  };

  return (
    <div className={`user-admin-row ${activeSuspension ? "suspended" : ""}`} key={user.id}>
      <div>
        <strong>{user.displayName}</strong>
        <span>{roleLabels[user.role]} · {user.phoneVerified ? "전화 인증" : "미인증"}</span>
        <div className="sanction-badges">
          {warningCount > 0 && <em className="sanction-pill warning">경고 {warningCount}</em>}
          {activeSuspension && <em className="sanction-pill suspension">정지 {formatSuspensionUntil(activeSuspension)}까지</em>}
        </div>
      </div>
      <div className="user-admin-actions">
        {currentUser.role === "admin" && user.id !== currentUser.id && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const nextRole = user.role === "member" ? "moderator" : "member";
              void onRunAction(
                `role-${user.id}`,
                () => onSetUserRole(user.id, nextRole),
                nextRole === "moderator" ? "운영진 권한을 부여했습니다." : "운영진 권한을 해제했습니다.",
              );
            }}
          >
            {busyAction === `role-${user.id}` ? "변경 중" : user.role === "member" ? "운영진 지정" : "권한 해제"}
          </button>
        )}
        {canSanction && (
          <>
            <button type="button" disabled={busy} onClick={() => requestSanction("warning")}>
              {busyAction === `sanction-warning-${user.id}` ? "처리 중" : "경고"}
            </button>
            <button type="button" disabled={busy || Boolean(activeSuspension)} onClick={() => requestSanction("suspension")}>
              {busyAction === `sanction-suspension-${user.id}` ? "처리 중" : "24h 정지"}
            </button>
          </>
        )}
        {activeSuspension && canSanction && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt("정지 해제 사유를 입력하세요.");
              if (!reason?.trim()) return;
              void onRunAction(
                `sanction-revoke-${activeSuspension.id}`,
                () => onRevokeSanction(activeSuspension.id, reason.trim()),
                "정지를 해제했습니다.",
              );
            }}
          >
            {busyAction === `sanction-revoke-${activeSuspension.id}` ? "해제 중" : "정지 해제"}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminView({
  state,
  currentUser,
  serviceStatus,
  serviceStatusError,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onSetUserRole,
  onSanctionUser,
  onRevokeSanction,
  onVerifyClaim,
  onResolveReport,
  onResolveAiAppeal,
  onResolvePrivacyRequest,
  onForceFinishChannel,
  onDeleteChannel,
  onCheckReadiness,
  onCheckStorage,
  onExportStateBackup,
  onExportSecureStateBackup,
  onExportAuditLogs,
  onValidateStateBackup,
  onRestoreStateBackup,
  onSyncNormalizedStorage,
  onSeedDemoStorage,
  onUpdateServiceNotice,
  onUpdatePlatformSettings,
  onAdjustUserCoins,
}: {
  state: AppState;
  currentUser: User;
  serviceStatus: PublicServiceStatus | null;
  serviceStatusError: string;
  onCreateRoom: (title: string, topic: string) => Promise<ActionResult>;
  onUpdateRoom: (roomId: string, title: string, topic: string) => Promise<ActionResult>;
  onDeleteRoom: (roomId: string) => Promise<ActionResult>;
  onSetUserRole: (userId: string, role: Role) => Promise<ActionResult>;
  onSanctionUser: (
    userId: string,
    type: SanctionType,
    reason: string,
    durationHours?: number,
    reportId?: string,
  ) => Promise<ActionResult>;
  onRevokeSanction: (sanctionId: string, reason?: string) => Promise<ActionResult>;
  onVerifyClaim: (
    userId: string,
    claimId: string,
    status?: VerificationStatus,
    reviewMemo?: string,
  ) => Promise<ActionResult>;
  onResolveReport: (reportId: string, status?: ReportStatus, reviewMemo?: string) => Promise<ActionResult>;
  onResolveAiAppeal: (appealId: string, status?: AiAppealStatus, reviewMemo?: string) => Promise<ActionResult>;
  onResolvePrivacyRequest: (requestId: string, status?: PrivacyRequestStatus, reviewMemo?: string) => Promise<ActionResult>;
  onForceFinishChannel: (channelId: string) => Promise<ActionResult>;
  onDeleteChannel: (channelId: string) => Promise<ActionResult>;
  onCheckReadiness: () => Promise<OperationalReadinessResult>;
  onCheckStorage: () => Promise<StorageCheckResult>;
  onExportStateBackup: () => Promise<StateExportResult>;
  onExportSecureStateBackup: (confirmation: string) => Promise<SecureStateExportResult>;
  onExportAuditLogs: (filters?: AuditLogFilter) => Promise<AuditExportResult>;
  onValidateStateBackup: (backup: unknown) => Promise<StateBackupValidationResult>;
  onRestoreStateBackup: (backup: unknown, confirmation: string) => Promise<StorageRestoreResult>;
  onSyncNormalizedStorage: () => Promise<StorageSyncResult>;
  onSeedDemoStorage: () => Promise<StorageSyncResult>;
  onUpdateServiceNotice: (
    notice: Pick<ServiceNotice, "title" | "body" | "tone" | "active"> & { expiresAt?: string | null },
  ) => Promise<ServiceNoticeUpdateResult>;
  onUpdatePlatformSettings: (platformSettings: PlatformSettings) => Promise<PlatformSettingsUpdateResult>;
  onAdjustUserCoins: (userId: string, amount: number, reason: string) => Promise<ActionResult>;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [noticeTitle, setNoticeTitle] = useState(state.serviceNotice?.title ?? "");
  const [noticeBody, setNoticeBody] = useState(state.serviceNotice?.body ?? "");
  const [noticeTone, setNoticeTone] = useState<ServiceNoticeTone>(state.serviceNotice?.tone ?? "info");
  const [noticeDuration, setNoticeDuration] = useState<ServiceNoticeDuration>("manual");
  const [coinTargetUserId, setCoinTargetUserId] = useState(state.users[0]?.id ?? "");
  const [coinAdjustmentAmount, setCoinAdjustmentAmount] = useState("");
  const [coinAdjustmentReason, setCoinAdjustmentReason] = useState("");
  const [platformSettingsDraft, setPlatformSettingsDraft] = useState<PlatformSettings>(() =>
    normalizePlatformSettings(state.platformSettings),
  );
  const [busyAction, setBusyAction] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [readiness, setReadiness] = useState<OperationalReadinessResult | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [readinessMessage, setReadinessMessage] = useState("");
  const [readinessError, setReadinessError] = useState("");
  const [storageCheck, setStorageCheck] = useState<StorageCheckResult | null>(null);
  const [storageBusy, setStorageBusy] = useState<"check" | "export" | "secure-export" | "validate" | "restore" | "sync" | "seed" | "">("");
  const [storageMessage, setStorageMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const [backupFileName, setBackupFileName] = useState("");
  const [backupValidation, setBackupValidation] = useState<StateBackupValidationResult | null>(null);
  const [secureBackupConfirmation, setSecureBackupConfirmation] = useState("");
  const [restoreBackupConfirmation, setRestoreBackupConfirmation] = useState("");
  const [validatedBackupPayload, setValidatedBackupPayload] = useState<unknown | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);
  const [auditExportMessage, setAuditExportMessage] = useState("");
  const [auditExportError, setAuditExportError] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditDateFilter, setAuditDateFilter] = useState("");
  const [claimReviewMemos, setClaimReviewMemos] = useState<Record<string, string>>({});
  const [reportReviewMemos, setReportReviewMemos] = useState<Record<string, string>>({});
  const [appealReviewMemos, setAppealReviewMemos] = useState<Record<string, string>>({});
  const [privacyReviewMemos, setPrivacyReviewMemos] = useState<Record<string, string>>({});
  const canManage = currentUser.role === "admin" || currentUser.role === "moderator";
  const canSecureBackup = currentUser.role === "admin";
  const allAuditLogs = state.auditLogs ?? [];
  const auditFilter: AuditLogFilter = {
    query: auditSearch.trim(),
    action: auditActionFilter,
    targetType: auditTargetTypeFilter,
    actor: auditActorFilter.trim(),
    date: auditDateFilter,
  };
  const filteredAuditLogs = allAuditLogs.filter((log) => auditLogMatchesFilter(log, auditFilter));
  const auditLogs = filteredAuditLogs.slice(0, AUDIT_LOG_RENDER_LIMIT);
  const recentAuditLogs = allAuditLogs.slice(0, 10);
  const auditFilterActive = auditFiltersActive(auditFilter);
  const auditActionOptions = Array.from(new Set(allAuditLogs.map((log) => log.action).filter(Boolean))).slice(0, 40);
  const auditTargetTypeOptions = Array.from(new Set(allAuditLogs.map((log) => log.targetType).filter(Boolean))).slice(0, 40);
  const auditRetentionPercent = Math.min(100, Math.round((allAuditLogs.length / AUDIT_LOG_RETENTION_LIMIT) * 100));
  const auditRetentionNearLimit = allAuditLogs.length >= Math.floor(AUDIT_LOG_RETENTION_LIMIT * 0.8);
  const activeReports = (state.reports ?? []).filter((report) => report.status === "open" || report.status === "reviewing");
  const completedReports = (state.reports ?? []).filter((report) => report.status === "resolved" || report.status === "dismissed");
  const activeAiAppeals = (state.aiAppeals ?? []).filter((appeal) => appeal.status === "pending" || appeal.status === "reviewing");
  const completedAiAppeals = (state.aiAppeals ?? []).filter((appeal) => appeal.status === "resolved" || appeal.status === "dismissed");
  const activePrivacyRequests = (state.privacyRequests ?? []).filter(
    (request) => request.status === "pending" || request.status === "reviewing",
  );
  const completedPrivacyRequests = (state.privacyRequests ?? []).filter(
    (request) => request.status === "resolved" || request.status === "dismissed",
  );
  const openReportCount = activeReports.length;
  const activeSanctionCount = (state.sanctions ?? []).filter((sanction) => isSanctionActive(sanction)).length;
  const activeNotice = state.serviceNotice?.active
    ? state.serviceNotice
    : serviceStatus?.notice?.active
      ? serviceStatus.notice
      : null;
  const incidentReadinessStatus =
    readiness?.launch.status ?? (serviceStatusError ? "degraded" : serviceStatus?.status ?? "checking");
  const incidentStatusLabel =
    readiness?.launch.label ??
    serviceStatus?.label ??
    (serviceStatusError ? "상태 확인 실패" : "상태 확인 중");

  useEffect(() => {
    setNoticeTitle(state.serviceNotice?.title ?? "");
    setNoticeBody(state.serviceNotice?.body ?? "");
    setNoticeTone(state.serviceNotice?.tone ?? "info");
    setNoticeDuration("manual");
  }, [state.serviceNotice?.id, state.serviceNotice?.title, state.serviceNotice?.body, state.serviceNotice?.tone]);

  useEffect(() => {
    setPlatformSettingsDraft(normalizePlatformSettings(state.platformSettings));
  }, [state.platformSettings]);

  useEffect(() => {
    if (!state.users.some((user) => user.id === coinTargetUserId)) {
      setCoinTargetUserId(state.users[0]?.id ?? "");
    }
  }, [coinTargetUserId, state.users]);

  const refreshReadiness = async () => {
    if (!canManage || readinessBusy) return;
    setReadinessBusy(true);
    setReadinessMessage("");
    setReadinessError("");
    try {
      const result = await onCheckReadiness();
      setReadiness(result);
      setReadinessMessage("운영 준비 상태를 확인했습니다.");
    } catch (error) {
      setReadinessError(error instanceof Error ? error.message : "운영 준비도 점검에 실패했습니다.");
    } finally {
      setReadinessBusy(false);
    }
  };

  useEffect(() => {
    if (!canManage || readiness) return;
    void refreshReadiness();
  }, [canManage, readiness]);

  const runAdminUiAction = async (
    actionKey: string,
    action: () => Promise<ActionResult>,
    successMessage: string,
  ) => {
    setBusyAction(actionKey);
    setAdminError("");
    setAdminMessage("");
    const result = await action();
    setBusyAction("");
    if (!result.ok) {
      setAdminError(result.message ?? "운영 작업에 실패했습니다.");
      return false;
    }
    setAdminMessage(successMessage);
    return true;
  };

  const updateDebateSettingDraft = (key: keyof PlatformSettings["debate"], value: string) => {
    setPlatformSettingsDraft((current) => ({
      ...current,
      debate: { ...current.debate, [key]: Number(value) },
    }));
  };

  const updateModerationSettingDraft = (key: keyof PlatformSettings["moderation"], value: string) => {
    setPlatformSettingsDraft((current) => ({
      ...current,
      moderation: { ...current.moderation, [key]: Number(value) },
    }));
  };

  const submitPlatformSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const normalizedDraft = normalizePlatformSettings(platformSettingsDraft);
    setPlatformSettingsDraft(normalizedDraft);
    await runAdminUiAction(
      "platform-settings-save",
      () => onUpdatePlatformSettings(normalizedDraft),
      "운영 정책 설정을 저장했습니다.",
    );
  };

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !topic.trim() || !canManage) return;
    const ok = await runAdminUiAction(
      "room-create",
      () => onCreateRoom(title.trim(), topic.trim()),
      "주제 방을 생성했습니다.",
    );
    if (!ok) return;
    setTitle("");
    setTopic("");
  };

  const submitServiceNotice = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const nextTitle = noticeTitle.trim();
    const nextBody = noticeBody.trim();
    if (!nextTitle || !nextBody) {
      setAdminError("공지 제목과 본문을 입력해주세요.");
      setAdminMessage("");
      return;
    }
    const expiresAt = serviceNoticeExpiresAtFromDuration(noticeDuration);
    const ok = await runAdminUiAction(
      "service-notice-publish",
      () => onUpdateServiceNotice({ title: nextTitle, body: nextBody, tone: noticeTone, active: true, expiresAt }),
      "운영 공지를 게시했습니다.",
    );
    if (ok) {
      setNoticeTitle(nextTitle);
      setNoticeBody(nextBody);
    }
  };

  const submitCoinAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSecureBackup) return;
    const target = state.users.find((user) => user.id === coinTargetUserId);
    const amount = Math.round(Number(coinAdjustmentAmount));
    const reason = coinAdjustmentReason.trim();
    if (!target || !Number.isFinite(amount) || amount === 0 || !reason) {
      setAdminError("조정 대상, 금액, 사유를 입력해주세요.");
      setAdminMessage("");
      return;
    }
    const ok = await runAdminUiAction(
      "coin-adjust",
      () => onAdjustUserCoins(target.id, amount, reason),
      `${target.displayName}님 코인을 ${amount > 0 ? "지급" : "차감"}했습니다.`,
    );
    if (ok) {
      setCoinAdjustmentAmount("");
      setCoinAdjustmentReason("");
    }
  };

  const clearServiceNotice = async () => {
    if (!canManage) return;
    const ok = await runAdminUiAction(
      "service-notice-clear",
      () => onUpdateServiceNotice({ title: noticeTitle, body: noticeBody, tone: noticeTone, active: false }),
      "운영 공지를 내렸습니다.",
    );
    if (ok) {
      setNoticeTitle("");
      setNoticeBody("");
      setNoticeTone("info");
      setNoticeDuration("manual");
    }
  };

  const refreshStorageCheck = async () => {
    if (!canManage) return;
    setStorageBusy("check");
    setStorageMessage("");
    setStorageError("");
    try {
      const result = await onCheckStorage();
      setStorageCheck(result);
      setStorageMessage("저장소 상태를 확인했습니다.");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "저장소 점검에 실패했습니다.");
    } finally {
      setStorageBusy("");
    }
  };

  const syncStorage = async () => {
    if (!canManage) return;
    setStorageBusy("sync");
    setStorageMessage("");
    setStorageError("");
    const result = await onSyncNormalizedStorage();
    setStorageBusy("");
    if (!result.ok) {
      setStorageError(result.message ?? "정규 테이블 동기화에 실패했습니다.");
      return;
    }
    if (result.storageCheck) setStorageCheck(result.storageCheck);
    setStorageMessage("현재 앱 상태를 Supabase 정규 테이블로 동기화했습니다.");
  };

  const exportStorageBackup = async () => {
    if (!canManage) return;
    setStorageBusy("export");
    setStorageMessage("");
    setStorageError("");
    try {
      const result = await onExportStateBackup();
      setStorageMessage(
        `상태 백업을 내려받았습니다. 사용자 ${result.counts.users}명, 채널 ${result.counts.channels}개, 감사 로그 ${result.counts.auditLogs}건이 포함됐습니다.`,
      );
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "상태 백업 다운로드에 실패했습니다.");
    } finally {
      setStorageBusy("");
    }
  };

  const exportSecureStorageBackup = async () => {
    if (!canSecureBackup) return;
    const confirmation = secureBackupConfirmation.trim();
    if (confirmation !== SECURE_BACKUP_CONFIRMATION) {
      setStorageError("보안 백업 확인 문구가 일치하지 않아 취소했습니다.");
      return;
    }
    setStorageBusy("secure-export");
    setStorageMessage("");
    setStorageError("");
    try {
      const result = await onExportSecureStateBackup(confirmation);
      setSecureBackupConfirmation("");
      setStorageMessage(
        `보안 백업을 내려받았습니다. 사용자 ${result.counts.users}명 중 ${result.secretCounts.passwordSecrets}명의 로그인 secret이 포함됐고 감사 로그가 남았습니다.`,
      );
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "보안 백업 다운로드에 실패했습니다.");
    } finally {
      setStorageBusy("");
    }
  };

  const validateBackupFile = async (file: File | null) => {
    if (!canManage || !file) return;
    setStorageBusy("validate");
    setStorageMessage("");
    setStorageError("");
    setBackupValidation(null);
    setValidatedBackupPayload(null);
    setBackupFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await onValidateStateBackup(parsed);
      setBackupValidation(result);
      setValidatedBackupPayload(result.valid ? parsed : null);
      const summary = `사용자 ${result.counts.users ?? 0}명 · 방 ${result.counts.rooms ?? 0}개 · 채널 ${result.counts.channels ?? 0}개`;
      setStorageMessage(result.valid ? `백업 파일 점검 통과: ${summary}` : `백업 파일 점검 필요: ${result.errors.join(", ")}`);
    } catch (error) {
      setBackupValidation(null);
      setStorageError(error instanceof Error ? error.message : "백업 JSON 파일을 읽거나 점검하지 못했습니다.");
    } finally {
      setStorageBusy("");
    }
  };

  const restoreValidatedBackup = async () => {
    if (!canSecureBackup || !validatedBackupPayload || !backupValidation) return;
    if (!backupValidation.valid || !backupValidation.secretsIncluded) {
      setStorageError("복구는 보안 백업처럼 로그인 secret이 포함된 full-state 백업만 사용할 수 있습니다.");
      return;
    }
    const confirmation = restoreBackupConfirmation.trim();
    if (confirmation !== RESTORE_BACKUP_CONFIRMATION) {
      setStorageError("복구 확인 문구가 일치하지 않아 취소했습니다.");
      return;
    }
    setStorageBusy("restore");
    setStorageMessage("");
    setStorageError("");
    try {
      const result = await onRestoreStateBackup(validatedBackupPayload, confirmation);
      if (result.storageCheck) setStorageCheck(result.storageCheck);
      setBackupValidation(null);
      setValidatedBackupPayload(null);
      setBackupFileName("");
      setRestoreBackupConfirmation("");
      setStorageMessage(
        `보안 백업에서 상태를 복구했습니다. 사용자 ${result.counts?.users ?? 0}명 · 채널 ${result.counts?.channels ?? 0}개가 적용됐고 감사 로그가 남았습니다.`,
      );
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "백업 복구에 실패했습니다.");
    } finally {
      setStorageBusy("");
    }
  };

  const seedStorage = async () => {
    if (!canManage) return;
    setStorageBusy("seed");
    setStorageMessage("");
    setStorageError("");
    const result = await onSeedDemoStorage();
    setStorageBusy("");
    if (!result.ok) {
      setStorageError(result.message ?? "데모 상태 복구에 실패했습니다.");
      return;
    }
    if (result.storageCheck) setStorageCheck(result.storageCheck);
    const restored = result.storageCheck?.appState;
    const restoredSummary = restored
      ? ` (${restored.users}명 · ${restored.rooms}개 방 · ${restored.channels}채널)`
      : "";
    setStorageMessage(`1차 MVP 데모 상태를 현재 저장소에 복구했습니다${restoredSummary}.`);
  };

  const exportAuditLogFiles = async () => {
    if (!canSecureBackup || auditExporting) return;
    setAuditExporting(true);
    setAuditExportMessage("");
    setAuditExportError("");
    try {
      const result = await onExportAuditLogs(auditFilter);
      const totalCount = result.totalCount ?? state.auditLogs.length;
      setAuditExportMessage(
        auditFilterActive
          ? `필터된 감사 로그 ${result.count}/${totalCount}건을 JSON/CSV로 내려받았습니다.`
          : `감사 로그 ${result.count}건을 JSON/CSV로 내려받았습니다.`,
      );
    } catch (error) {
      setAuditExportError(error instanceof Error ? error.message : "감사 로그 다운로드에 실패했습니다.");
    } finally {
      setAuditExporting(false);
    }
  };

  const downloadAdminFile = (filename: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const buildOperationsSnapshot = () => {
    const generatedAt = new Date().toISOString();
    return {
      type: "nosu-best-operations-snapshot",
      generatedAt,
      generatedBy: {
        id: currentUser.id,
        displayName: currentUser.displayName,
        role: currentUser.role,
      },
      service: serviceStatus
        ? {
            status: serviceStatus.status,
            label: serviceStatus.label,
            checkedAt: serviceStatus.checkedAt,
            realtime: serviceStatus.realtime,
            storage: serviceStatus.storage,
            release: serviceStatus.runtime.release,
            process: serviceStatus.runtime.process,
          }
        : {
            status: serviceStatusError ? "degraded" : "checking",
            label: serviceStatusError || "상태 확인 전",
          },
      activeNotice,
      readiness: readiness
        ? {
            checkedAt: readiness.checkedAt,
            summary: readiness.summary,
            launch: {
              status: readiness.launch.status,
              label: readiness.launch.label,
              headline: readiness.launch.headline,
              blockers: readiness.launch.blockers,
              warnings: readiness.launch.warnings,
              nextActions: readiness.launch.nextActions,
              requiredOpen: readiness.launch.requiredOpen,
              recommendedOpen: readiness.launch.recommendedOpen,
              promotionGate: readiness.launch.promotionGate
                ? {
                    status: readiness.launch.promotionGate.status,
                    label: readiness.launch.promotionGate.label,
                    detail: readiness.launch.promotionGate.detail,
                    readyCount: readiness.launch.promotionGate.readyCount,
                    requiredCount: readiness.launch.promotionGate.requiredCount,
                    blockedCount: readiness.launch.promotionGate.blockedCount,
                    strict: readiness.launch.promotionGate.strict,
                    nextActions: readiness.launch.promotionGate.nextActions,
                    artifacts: readiness.launch.promotionGate.artifacts.map((artifact) => ({
                      id: artifact.id,
                      label: artifact.label,
                      status: artifact.status,
                      ok: artifact.ok,
                      fresh: artifact.fresh,
                      exists: artifact.exists,
                      detail: artifact.detail,
                      ageMinutes: artifact.ageMinutes,
                      path: artifact.path,
                    })),
                  }
                : null,
            },
          }
        : null,
      storage: storageCheck
        ? {
            checkedAt: storageCheck.checkedAt,
            ok: storageCheck.ok,
            storage: storageCheck.storage,
            storageMode: storageCheck.storageMode,
            normalized: storageCheck.normalized,
            appState: storageCheck.appState,
            expectedTotalRows: storageCheck.expectedTotalRows,
          }
        : null,
      appState: {
        users: state.users.length,
        activeUsers: state.users.filter((user) => !user.deactivatedAt).length,
        rooms: state.rooms.length,
        channels: state.channels.length,
        liveChannels: state.channels.filter((channel) => channel.status === "live" || channel.status === "voting").length,
        openReports: openReportCount,
        activeSanctions: activeSanctionCount,
        auditLogs: state.auditLogs.length,
      },
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        actorName: log.actorName,
        actorRole: log.actorRole,
        summary: log.summary,
        targetType: log.targetType,
        targetId: log.targetId,
        createdAt: log.createdAt,
        metadata: log.metadata ?? {},
      })),
      nextActions:
        readiness?.launch.promotionGate &&
        readiness.launch.promotionGate.status !== "ready" &&
        readiness.launch.promotionGate.nextActions.length
          ? readiness.launch.promotionGate.nextActions
          : readiness?.launch.nextActions?.length
            ? readiness.launch.nextActions
          : ["운영 준비도 점검을 새로 실행하고, 공지/감사 로그/저장소 상태를 확인하세요."],
    };
  };

  const renderOperationsSnapshotMarkdown = (snapshot: ReturnType<typeof buildOperationsSnapshot>) => {
    const release =
      "release" in snapshot.service && snapshot.service.release
        ? `${snapshot.service.release.version} / ${snapshot.service.release.commitShort}`
        : "확인 전";
    const readinessSummary = snapshot.readiness
      ? `${snapshot.readiness.launch.label} · ${snapshot.readiness.summary.score}점 · 막힘 ${snapshot.readiness.summary.blocked}개 · 주의 ${snapshot.readiness.summary.warning}개`
      : "운영 준비도 점검 전";
    const storageSummary = snapshot.storage
      ? `${snapshot.storage.storage} / ${snapshot.storage.storageMode} / ${snapshot.storage.ok ? "정상" : "확인 필요"}`
      : "저장소 점검 전";
    const noticeSummary = snapshot.activeNotice
      ? `${snapshot.activeNotice.title} (${serviceNoticeToneLabels[snapshot.activeNotice.tone]}, ${formatServiceNoticeExpiry(snapshot.activeNotice)})`
      : "활성 공지 없음";
    const auditLines = snapshot.recentAuditLogs.length
      ? snapshot.recentAuditLogs
          .map((log) => `- ${log.createdAt} · ${log.actorName} · ${log.action}: ${log.summary}`)
          .join("\n")
      : "- 최근 감사 로그 없음";
    const actionLines = snapshot.nextActions.map((action) => `- ${action}`).join("\n");
    return [
      "# 노수베스트 운영 상황 스냅샷",
      "",
      `- 생성 시각: ${snapshot.generatedAt}`,
      `- 생성자: ${snapshot.generatedBy.displayName} (${roleLabels[snapshot.generatedBy.role] ?? snapshot.generatedBy.role})`,
      `- 서비스 상태: ${snapshot.service.label}`,
      `- 릴리스: ${release}`,
      `- 공지: ${noticeSummary}`,
      `- readiness: ${readinessSummary}`,
      `- 저장소: ${storageSummary}`,
      `- 앱 상태: 사용자 ${snapshot.appState.activeUsers}/${snapshot.appState.users}명, 방 ${snapshot.appState.rooms}개, 채널 ${snapshot.appState.channels}개, 열린 신고 ${snapshot.appState.openReports}건, 활성 제재 ${snapshot.appState.activeSanctions}건`,
      "",
      "## 다음 액션",
      actionLines,
      "",
      "## 최근 감사 로그",
      auditLines,
      "",
    ].join("\n");
  };

  const exportOperationsSnapshot = (format: "json" | "markdown") => {
    const snapshot = buildOperationsSnapshot();
    const stamp = snapshot.generatedAt.replace(/[:.]/g, "-").slice(0, 19);
    if (format === "json") {
      downloadAdminFile(
        `nosu-best-ops-snapshot-${stamp}.json`,
        JSON.stringify(snapshot, null, 2),
        "application/json;charset=utf-8",
      );
      setAdminMessage("운영 상황 스냅샷 JSON을 저장했습니다.");
      return;
    }
    downloadAdminFile(
      `nosu-best-ops-snapshot-${stamp}.md`,
      renderOperationsSnapshotMarkdown(snapshot),
      "text/markdown;charset=utf-8",
    );
    setAdminMessage("운영 상황 스냅샷 Markdown을 저장했습니다.");
  };

  return (
    <main className="single-view admin-view">
      <section className="admin-layout">
        <div className="section-heading">
          <div>
            <p className="eyebrow">운영</p>
            <h2>주제 방 생성과 권한 관리</h2>
            <p>메인 운영자와 운영진만 새 토론 주제 방을 열 수 있습니다.</p>
          </div>
          <RoleBadge role={currentUser.role} />
        </div>
        <form className="room-create-form" onSubmit={submitRoom}>
          <label>
            방 이름
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 플랫폼 규제"
              disabled={!canManage || busyAction === "room-create"}
            />
          </label>
          <label>
            토론 주제
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="예: 알고리즘 규제를 강화해야 하는가?"
              disabled={!canManage || busyAction === "room-create"}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!canManage || busyAction === "room-create"}>
            <Plus size={18} aria-hidden />
            {busyAction === "room-create" ? "생성 중" : "방 생성"}
          </button>
        </form>
        {adminError && (
          <p className="form-error" role="alert">
            {adminError}
          </p>
        )}
        {adminMessage && (
          <p className="quiet-text" role="status" aria-live="polite" data-smoke="admin-message">
            {adminMessage}
          </p>
        )}
        <section className="service-notice-panel" data-smoke="admin-coin-adjust-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">코인 조정</p>
              <h3>수동 지급/차감</h3>
              <p>사유가 있는 관리자 조정만 허용되며 차감 후 음수 잔액은 서버에서 거절됩니다.</p>
            </div>
          </div>
          <form className="service-notice-form" onSubmit={submitCoinAdjustment}>
            <label>
              대상
              <select
                value={coinTargetUserId}
                onChange={(event) => setCoinTargetUserId(event.target.value)}
                disabled={!canSecureBackup || Boolean(busyAction)}
                data-smoke="coin-adjust-user"
              >
                {state.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} · {user.coins.toLocaleString()}코인
                  </option>
                ))}
              </select>
            </label>
            <label>
              금액
              <input
                type="number"
                step={10}
                value={coinAdjustmentAmount}
                onChange={(event) => setCoinAdjustmentAmount(event.target.value)}
                placeholder="예: 100 또는 -50"
                disabled={!canSecureBackup || Boolean(busyAction)}
                data-smoke="coin-adjust-amount"
              />
            </label>
            <label className="wide-field">
              사유
              <textarea
                value={coinAdjustmentReason}
                onChange={(event) => setCoinAdjustmentReason(event.target.value)}
                rows={2}
                maxLength={200}
                placeholder="조정 사유"
                disabled={!canSecureBackup || Boolean(busyAction)}
                data-smoke="coin-adjust-reason"
              />
            </label>
            <div className="service-notice-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={
                  !canSecureBackup ||
                  Boolean(busyAction) ||
                  !coinTargetUserId ||
                  !coinAdjustmentAmount ||
                  !coinAdjustmentReason.trim()
                }
                data-smoke="coin-adjust-submit"
              >
                <Coins size={16} aria-hidden />
                {busyAction === "coin-adjust" ? "조정 중" : "조정 저장"}
              </button>
            </div>
          </form>
        </section>
        <section
          className="service-notice-panel"
          data-smoke="platform-settings-panel"
          data-default-coin-stake={state.platformSettings.debate.defaultCoinStake}
          data-report-threshold={state.platformSettings.moderation.reportReviewThreshold}
        >
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">운영 정책</p>
              <h3>토론·보상·신고 기본값</h3>
              <p>새 토론과 운영 조치에 적용할 기본 시간, 코인 보상, 신고/제재 기준을 저장합니다.</p>
            </div>
            <span className="service-notice-status info">
              기본 {state.platformSettings.debate.defaultCoinStake}코인
            </span>
          </div>
          <form className="service-notice-form" onSubmit={submitPlatformSettings}>
            <label>
              입론 시간(초)
              <input
                type="number"
                min={30}
                max={600}
                value={platformSettingsDraft.debate.openingSeconds}
                onChange={(event) => updateDebateSettingDraft("openingSeconds", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-opening-seconds"
              />
            </label>
            <label>
              교차질문 시간(초)
              <input
                type="number"
                min={30}
                max={600}
                value={platformSettingsDraft.debate.crossfireSeconds}
                onChange={(event) => updateDebateSettingDraft("crossfireSeconds", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-crossfire-seconds"
              />
            </label>
            <label>
              최종 발언 시간(초)
              <input
                type="number"
                min={30}
                max={600}
                value={platformSettingsDraft.debate.closingSeconds}
                onChange={(event) => updateDebateSettingDraft("closingSeconds", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-closing-seconds"
              />
            </label>
            <label>
              기본 판돈
              <input
                type="number"
                min={0}
                max={10000}
                step={10}
                value={platformSettingsDraft.debate.defaultCoinStake}
                onChange={(event) => updateDebateSettingDraft("defaultCoinStake", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-default-coin-stake"
              />
            </label>
            <label>
              최소 보상
              <input
                type="number"
                min={0}
                max={10000}
                step={10}
                value={platformSettingsDraft.debate.minWinnerRewardCoins}
                onChange={(event) => updateDebateSettingDraft("minWinnerRewardCoins", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-min-reward"
              />
            </label>
            <label>
              보상 비율
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={platformSettingsDraft.debate.winnerRewardRate}
                onChange={(event) => updateDebateSettingDraft("winnerRewardRate", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-reward-rate"
              />
            </label>
            <label>
              입론 글자수
              <input
                type="number"
                min={100}
                max={3000}
                value={platformSettingsDraft.debate.maxOpeningChars}
                onChange={(event) => updateDebateSettingDraft("maxOpeningChars", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
              />
            </label>
            <label>
              본토론 글자수
              <input
                type="number"
                min={100}
                max={2000}
                value={platformSettingsDraft.debate.maxDebateChars}
                onChange={(event) => updateDebateSettingDraft("maxDebateChars", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
              />
            </label>
            <label>
              신고 사유 글자수
              <input
                type="number"
                min={20}
                max={500}
                value={platformSettingsDraft.debate.maxReportReasonChars}
                onChange={(event) => updateDebateSettingDraft("maxReportReasonChars", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
              />
            </label>
            <label>
              검토 임계 신고수
              <input
                type="number"
                min={1}
                max={20}
                value={platformSettingsDraft.moderation.reportReviewThreshold}
                onChange={(event) => updateModerationSettingDraft("reportReviewThreshold", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-report-threshold"
              />
            </label>
            <label>
              기본 정지 시간
              <input
                type="number"
                min={1}
                max={720}
                value={platformSettingsDraft.moderation.suspensionDefaultHours}
                onChange={(event) => updateModerationSettingDraft("suspensionDefaultHours", event.target.value)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-suspension-hours"
              />
            </label>
            <div className="service-notice-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="platform-settings-save"
              >
                <Settings size={16} aria-hidden />
                {busyAction === "platform-settings-save" ? "저장 중" : "설정 저장"}
              </button>
            </div>
          </form>
        </section>
        <section className="service-notice-panel" data-smoke="admin-service-notice-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">서비스 공지</p>
              <h3>상단 배너 관리</h3>
              <p>점검, 장애, 정책 변경처럼 모든 로그인 사용자에게 바로 보여야 하는 메시지를 띄웁니다.</p>
            </div>
            {state.serviceNotice ? (
              <span className={`service-notice-status ${state.serviceNotice.tone}`}>
                {serviceNoticeToneLabels[state.serviceNotice.tone]} 표시 중
              </span>
            ) : (
              <span className="service-notice-status idle">비표시</span>
            )}
          </div>
          <form className="service-notice-form" onSubmit={submitServiceNotice}>
            <label>
              제목
              <input
                value={noticeTitle}
                onChange={(event) => setNoticeTitle(event.target.value)}
                placeholder="예: 오늘 23:00 점검 안내"
                maxLength={80}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="service-notice-title"
              />
            </label>
            <label>
              종류
              <select
                value={noticeTone}
                onChange={(event) => setNoticeTone(event.target.value as ServiceNoticeTone)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="service-notice-tone"
              >
                <option value="info">안내</option>
                <option value="warning">점검</option>
                <option value="critical">긴급</option>
              </select>
            </label>
            <label>
              자동 해제
              <select
                value={noticeDuration}
                onChange={(event) => setNoticeDuration(event.target.value as ServiceNoticeDuration)}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="service-notice-duration"
              >
                {Object.entries(serviceNoticeDurationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide-field">
              본문
              <textarea
                value={noticeBody}
                onChange={(event) => setNoticeBody(event.target.value)}
                placeholder="사용자에게 필요한 영향 범위와 예상 시간을 짧게 적어주세요."
                maxLength={220}
                rows={3}
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="service-notice-body"
              />
            </label>
            <div className="service-notice-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={!canManage || Boolean(busyAction) || !state.serviceNotice}
                onClick={() => void clearServiceNotice()}
                data-smoke="service-notice-clear"
              >
                <Trash2 size={16} aria-hidden />
                {busyAction === "service-notice-clear" ? "내리는 중" : "공지 내리기"}
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={!canManage || Boolean(busyAction)}
                data-smoke="service-notice-publish"
              >
                <Bell size={16} aria-hidden />
                {busyAction === "service-notice-publish" ? "게시 중" : "공지 게시"}
              </button>
            </div>
          </form>
          {state.serviceNotice && (
            <p className="service-notice-preview" data-smoke="service-notice-preview">
              <strong>{state.serviceNotice.title}</strong>
              <span>{state.serviceNotice.body}</span>
              <small>
                {formatDateTime(state.serviceNotice.updatedAt)} 업데이트 · {formatServiceNoticeExpiry(state.serviceNotice)}
              </small>
            </p>
          )}
        </section>
        <section
          className="ops-snapshot-panel"
          data-smoke="ops-snapshot-panel"
          data-incident-status={incidentReadinessStatus}
          data-open-reports={openReportCount}
          data-active-sanctions={activeSanctionCount}
          data-audit-count={state.auditLogs.length}
          data-active-notice={activeNotice ? "true" : "false"}
        >
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">상황실</p>
              <h3>운영 상황 스냅샷</h3>
              <p>장애, 점검, 배포 전 공유용으로 현재 서비스 상태와 최근 운영 이력을 한 파일로 저장합니다.</p>
            </div>
            <span className={`ops-snapshot-status ${incidentReadinessStatus}`}>
              {incidentStatusLabel}
            </span>
          </div>
          <div className="ops-snapshot-grid">
            <span>
              <Bell size={15} aria-hidden />
              <b>공지</b>
              <em>{activeNotice ? `${activeNotice.title} · ${serviceNoticeToneLabels[activeNotice.tone]} · ${formatServiceNoticeExpiry(activeNotice)}` : "활성 공지 없음"}</em>
            </span>
            <span>
              <ShieldCheck size={15} aria-hidden />
              <b>Readiness</b>
              <em>{readiness ? `${readiness.summary.score}점 · 막힘 ${readiness.summary.blocked} · 주의 ${readiness.summary.warning}` : "점검 전"}</em>
            </span>
            <span>
              <Inbox size={15} aria-hidden />
              <b>신고/제재</b>
              <em>열린 신고 {openReportCount}건 · 활성 제재 {activeSanctionCount}건</em>
            </span>
            <span>
              <History size={15} aria-hidden />
              <b>감사 로그</b>
              <em>최근 {recentAuditLogs.length}건 / 전체 {state.auditLogs.length}건</em>
            </span>
          </div>
          <div className="ops-snapshot-actions">
            <button type="button" onClick={() => exportOperationsSnapshot("json")} data-smoke="ops-snapshot-json">
              <Download size={15} aria-hidden />
              JSON 저장
            </button>
            <button type="button" onClick={() => exportOperationsSnapshot("markdown")} data-smoke="ops-snapshot-markdown">
              <Download size={15} aria-hidden />
              Markdown 저장
            </button>
          </div>
        </section>
        <ReadinessPanel
          readiness={readiness}
          readinessBusy={readinessBusy}
          readinessMessage={readinessMessage}
          readinessError={readinessError}
          canManage={canManage}
          onRefresh={refreshReadiness}
        />
        <StorageOpsPanel
          storageCheck={storageCheck}
          storageBusy={storageBusy}
          storageMessage={storageMessage}
          storageError={storageError}
          backupFileName={backupFileName}
          backupValidation={backupValidation}
          secureBackupConfirmation={secureBackupConfirmation}
          restoreBackupConfirmation={restoreBackupConfirmation}
          canManage={canManage}
          canSecureBackup={canSecureBackup}
          onRefresh={refreshStorageCheck}
          onExport={exportStorageBackup}
          onSecureExport={exportSecureStorageBackup}
          onSecureBackupConfirmationChange={setSecureBackupConfirmation}
          onValidateBackup={validateBackupFile}
          onRestoreBackup={restoreValidatedBackup}
          onRestoreBackupConfirmationChange={setRestoreBackupConfirmation}
          onSync={syncStorage}
          onSeed={seedStorage}
        />
        <section className="room-admin-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">주제 방</p>
              <h3>방 수정과 정리</h3>
            </div>
            <span>{state.rooms.length}개</span>
          </div>
          <div className="room-admin-list">
            {state.rooms.length === 0 && <EmptyState title="주제 방 없음" body="새 토론 주제 방을 먼저 생성해주세요." />}
            {state.rooms.map((room) => (
              <RoomAdminRow
                key={room.id}
                room={room}
                channelCount={state.channels.filter((channel) => channel.roomId === room.id).length}
                canManage={canManage}
                canDelete={state.rooms.length > 1}
                busyAction={busyAction}
                onRunAction={runAdminUiAction}
                onUpdateRoom={onUpdateRoom}
                onDeleteRoom={onDeleteRoom}
              />
            ))}
          </div>
        </section>
        <div className="admin-columns">
          <section>
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">권한</p>
                <h3>운영진 부여</h3>
              </div>
            </div>
            <div className="user-admin-list">
              {state.users.map((user) => (
                <UserAdminRow
                  key={user.id}
                  user={user}
                  state={state}
                  currentUser={currentUser}
                  busyAction={busyAction}
                  onRunAction={runAdminUiAction}
                  onSetUserRole={onSetUserRole}
                  onSanctionUser={onSanctionUser}
                  onRevokeSanction={onRevokeSanction}
                />
              ))}
            </div>
          </section>
          <section>
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">개인정보 요청</p>
                <h3>삭제 요청 큐</h3>
              </div>
            </div>
            <div className="report-list" data-smoke="privacy-request-list">
              {activePrivacyRequests.length === 0 && <EmptyState title="삭제 요청 없음" body="현재 처리 대기 중인 개인정보 삭제 요청이 없습니다." />}
              {completedPrivacyRequests.length > 0 && (
                <small>처리 완료/보류 요청 {completedPrivacyRequests.length}건은 기본 목록에서 접혔습니다.</small>
              )}
              {activePrivacyRequests.map((privacyRequest) => {
                const requester = state.users.find((user) => user.id === privacyRequest.userId);
                const reviewMemo = privacyReviewMemos[privacyRequest.id] ?? privacyRequest.reviewMemo ?? "";
                const clearPrivacyMemo = () => {
                  setPrivacyReviewMemos((previous) => {
                    const next = { ...previous };
                    delete next[privacyRequest.id];
                    return next;
                  });
                };
                return (
                  <div className={`report-row ${privacyRequest.status}`} key={privacyRequest.id}>
                    <div>
                      <strong>{privacyRequest.reason || "사용자 삭제 요청"}</strong>
                      <span>
                        {privacyRequestStatusLabels[privacyRequest.status]} · {(requester?.displayName ?? privacyRequest.userName) || privacyRequest.userId} · {privacyRequest.createdAt}
                      </span>
                      <small>요청 ID: {privacyRequest.id}</small>
                      {privacyRequest.reviewerName && <small>담당자: {privacyRequest.reviewerName}</small>}
                      {privacyRequest.reviewMemo && <small>처리 메모: {privacyRequest.reviewMemo}</small>}
                    </div>
                    {canManage && (
                      <div className="report-actions">
                        <textarea
                          value={reviewMemo}
                          onChange={(event) =>
                            setPrivacyReviewMemos((previous) => ({ ...previous, [privacyRequest.id]: event.target.value }))
                          }
                          placeholder="처리 메모"
                          rows={2}
                        />
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAdminUiAction(
                              `privacy-reviewing-${privacyRequest.id}`,
                              () => onResolvePrivacyRequest(privacyRequest.id, "reviewing", reviewMemo.trim() || "검토를 시작했습니다."),
                              "개인정보 요청을 검토중으로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `privacy-reviewing-${privacyRequest.id}` ? "처리 중" : "검토중"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction) || !reviewMemo.trim()}
                          onClick={() => {
                            void runAdminUiAction(
                              `privacy-resolve-${privacyRequest.id}`,
                              async () => {
                                const result = await onResolvePrivacyRequest(privacyRequest.id, "resolved", reviewMemo.trim());
                                if (result.ok) clearPrivacyMemo();
                                return result;
                              },
                              "개인정보 요청을 처리 완료로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `privacy-resolve-${privacyRequest.id}` ? "처리 중" : "처리 완료"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction) || !reviewMemo.trim()}
                          onClick={() => {
                            void runAdminUiAction(
                              `privacy-dismiss-${privacyRequest.id}`,
                              async () => {
                                const result = await onResolvePrivacyRequest(privacyRequest.id, "dismissed", reviewMemo.trim());
                                if (result.ok) clearPrivacyMemo();
                                return result;
                              },
                              "개인정보 요청을 보류/기각했습니다.",
                            );
                          }}
                        >
                          {busyAction === `privacy-dismiss-${privacyRequest.id}` ? "처리 중" : "보류/기각"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">프로필 인증</p>
                <h3>검토 대기 이력</h3>
              </div>
            </div>
            <div className="claim-list">
              {state.users.flatMap((user) =>
                user.claims
                  .filter((claim) => claim.status === "pending")
                  .map((claim) => {
                    const reviewKey = `${user.id}-${claim.id}`;
                    const reviewMemo = claimReviewMemos[reviewKey] ?? "";
                    const evidenceUrl = claim.evidenceUrl?.trim();
                    const clearReviewMemo = () => {
                      setClaimReviewMemos((previous) => {
                        const next = { ...previous };
                        delete next[reviewKey];
                        return next;
                      });
                    };
                    return (
                      <div className="claim-row" key={reviewKey}>
                        <div>
                          <strong>{user.displayName} · {claim.label}</strong>
                          <span>{claim.value}</span>
                          {claim.submittedReason && <small>제출 사유: {claim.submittedReason}</small>}
                          {claim.evidenceText && <small>증빙 메모: {claim.evidenceText}</small>}
                          {evidenceUrl && (
                            <a href={evidenceUrl} target="_blank" rel="noreferrer">
                              증빙 링크 열기
                            </a>
                          )}
                          {claim.submittedAt && <small>제출 시각: {claim.submittedAt}</small>}
                        </div>
                        {canManage && (
                          <div className="claim-request-panel">
                            <textarea
                              value={reviewMemo}
                              onChange={(event) =>
                                setClaimReviewMemos((previous) => ({ ...previous, [reviewKey]: event.target.value }))
                              }
                              placeholder="승인/반려 심사 메모"
                              rows={2}
                            />
                            <div className="report-actions">
                              <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={() => {
                                  void runAdminUiAction(
                                    `claim-${reviewKey}-approve`,
                                    async () => {
                                      const result = await onVerifyClaim(user.id, claim.id, "verified", reviewMemo.trim());
                                      if (result.ok) clearReviewMemo();
                                      return result;
                                    },
                                    "프로필 이력을 인증했습니다.",
                                  );
                                }}
                              >
                                {busyAction === `claim-${reviewKey}-approve` ? "처리 중" : "승인"}
                              </button>
                              <button
                                type="button"
                                disabled={Boolean(busyAction) || !reviewMemo.trim()}
                                onClick={() => {
                                  void runAdminUiAction(
                                    `claim-${reviewKey}-reject`,
                                    async () => {
                                      const result = await onVerifyClaim(user.id, claim.id, "rejected", reviewMemo.trim());
                                      if (result.ok) clearReviewMemo();
                                      return result;
                                    },
                                    "프로필 이력을 반려했습니다.",
                                  );
                                }}
                              >
                                {busyAction === `claim-${reviewKey}-reject` ? "처리 중" : "반려"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }),
              )}
            </div>
          </section>
          <section>
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">AI 판정</p>
                <h3>이의제기 검토 큐</h3>
              </div>
            </div>
            <div className="report-list">
              {activeAiAppeals.length === 0 && <EmptyState title="이의제기 없음" body="현재 재검토 요청이 없습니다." />}
              {completedAiAppeals.length > 0 && (
                <small>처리 완료/기각 이의제기 {completedAiAppeals.length}건은 기본 목록에서 접혔습니다.</small>
              )}
              {activeAiAppeals.map((appeal) => {
                const channel = state.channels.find((item) => item.id === appeal.channelId);
                const requester = state.users.find((user) => user.id === appeal.userId);
                const reviewMemo = appealReviewMemos[appeal.id] ?? appeal.reviewMemo ?? "";
                return (
                  <div className={`report-row ${appeal.status}`} key={appeal.id}>
                    <div>
                      <strong>{appeal.reason}</strong>
                      <span>
                        {aiAppealStatusLabels[appeal.status]} · {(requester?.displayName ?? appeal.userName) || "알 수 없음"} · {appeal.createdAt}
                      </span>
                      {channel && <small>{channel.title}</small>}
                      {appeal.reviewMemo && <small>처리 메모: {appeal.reviewMemo}</small>}
                    </div>
                    {canManage && (
                      <div className="report-actions">
                        <textarea
                          value={reviewMemo}
                          onChange={(event) =>
                            setAppealReviewMemos((previous) => ({ ...previous, [appeal.id]: event.target.value }))
                          }
                          placeholder="재검토 처리 메모"
                          rows={2}
                        />
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAdminUiAction(
                              `appeal-reviewing-${appeal.id}`,
                              () => onResolveAiAppeal(appeal.id, "reviewing", reviewMemo.trim() || "재검토를 시작했습니다."),
                              "이의제기를 검토중으로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `appeal-reviewing-${appeal.id}` ? "처리 중" : "검토중"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAdminUiAction(
                              `appeal-resolve-${appeal.id}`,
                              () => onResolveAiAppeal(appeal.id, "resolved", reviewMemo.trim() || "AI 판정 근거를 재검토했습니다."),
                              "이의제기를 처리 완료로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `appeal-resolve-${appeal.id}` ? "처리 중" : "처리 완료"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction) || !reviewMemo.trim()}
                          onClick={() => {
                            void runAdminUiAction(
                              `appeal-dismiss-${appeal.id}`,
                              () => onResolveAiAppeal(appeal.id, "dismissed", reviewMemo.trim()),
                              "이의제기를 기각했습니다.",
                            );
                          }}
                        >
                          {busyAction === `appeal-dismiss-${appeal.id}` ? "처리 중" : "기각"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">신고</p>
                <h3>운영 검토 큐</h3>
              </div>
            </div>
            <div className="report-list">
              {activeReports.length === 0 && <EmptyState title="신고 없음" body="현재 검토 대기 항목이 없습니다." />}
              {completedReports.length > 0 && (
                <small>처리 완료/기각 신고 {completedReports.length}건은 기본 목록에서 접혔습니다.</small>
              )}
              {activeReports.map((report) => {
                const reporter = state.users.find((user) => user.id === report.reporterId);
                const channel = state.channels.find((item) => item.id === report.channelId);
                const targetUser = findReportTargetUser(report, state);
                const reportMemo = reportReviewMemos[report.id] ?? report.reviewMemo ?? "";
                const canSanctionTarget =
                  targetUser &&
                  targetUser.id !== currentUser.id &&
                  (currentUser.role === "admin" || targetUser.role === "member");
                return (
                  <div className={`report-row ${report.status}`} key={report.id}>
                    <div>
                      <strong>{report.reason}</strong>
                      <span>
                        {reportStatusLabels[report.status]} · {report.targetType} · {reporter?.displayName ?? "알 수 없음"} · {report.createdAt}
                      </span>
                      {channel && <small>{channel.title}</small>}
                      <small>대상 ID: {report.targetId}</small>
                      {targetUser && <small>대상: {targetUser.displayName}</small>}
                      {report.assigneeName && <small>담당자: {report.assigneeName}</small>}
                      {report.reviewMemo && <small>처리 메모: {report.reviewMemo}</small>}
                      {report.statusHistory?.[0] && (
                        <small>
                          최근 처리: {reportStatusLabels[report.statusHistory[0].status]} · {report.statusHistory[0].actorName} · {report.statusHistory[0].createdAt}
                        </small>
                      )}
                    </div>
                    {canManage && (
                      <div className="report-actions">
                        <textarea
                          value={reportMemo}
                          onChange={(event) =>
                            setReportReviewMemos((previous) => ({ ...previous, [report.id]: event.target.value }))
                          }
                          placeholder="처리 메모"
                          rows={2}
                        />
                        {canSanctionTarget && (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => {
                                void runAdminUiAction(
                                  `report-warning-${report.id}`,
                                  () => onSanctionUser(targetUser.id, "warning", report.reason, undefined, report.id),
                                  "신고 대상에게 경고를 부여했습니다.",
                                );
                              }}
                            >
                              {busyAction === `report-warning-${report.id}` ? "처리 중" : "대상 경고"}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyAction) || Boolean(getActiveSuspension(state, targetUser.id))}
                              onClick={() => {
                                void runAdminUiAction(
                                  `report-suspend-${report.id}`,
                                  () => onSanctionUser(targetUser.id, "suspension", report.reason, 24, report.id),
                                  "신고 대상을 24시간 정지했습니다.",
                                );
                              }}
                            >
                              {busyAction === `report-suspend-${report.id}` ? "처리 중" : "24h 정지"}
                            </button>
                          </>
                        )}
                        {channel && (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => {
                                void runAdminUiAction(
                                  `finish-${channel.id}`,
                                  () => onForceFinishChannel(channel.id),
                                  "채널을 강제 종료했습니다.",
                                );
                              }}
                            >
                              {busyAction === `finish-${channel.id}` ? "종료 중" : "강제 종료"}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyAction)}
                              onClick={() => {
                                if (!window.confirm("이 신고 채널을 삭제할까요?")) return;
                                void runAdminUiAction(
                                  `delete-${channel.id}`,
                                  () => onDeleteChannel(channel.id),
                                  "채널을 삭제했습니다.",
                                );
                              }}
                            >
                              {busyAction === `delete-${channel.id}` ? "삭제 중" : "채널 삭제"}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAdminUiAction(
                              `report-reviewing-${report.id}`,
                              () => onResolveReport(report.id, "reviewing", reportMemo.trim() || "검토를 시작했습니다."),
                              "신고를 검토중으로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `report-reviewing-${report.id}` ? "처리 중" : "검토중"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            void runAdminUiAction(
                              `report-${report.id}`,
                              () => onResolveReport(report.id, "resolved", reportMemo.trim()),
                              "신고를 처리 완료로 표시했습니다.",
                            );
                          }}
                        >
                          {busyAction === `report-${report.id}` ? "처리 중" : "처리 완료"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyAction) || !reportMemo.trim()}
                          onClick={() => {
                            void runAdminUiAction(
                              `report-dismiss-${report.id}`,
                              () => onResolveReport(report.id, "dismissed", reportMemo.trim()),
                              "신고를 기각했습니다.",
                            );
                          }}
                        >
                          {busyAction === `report-dismiss-${report.id}` ? "처리 중" : "기각"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <section className="audit-log-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">감사 로그</p>
              <h3>운영 변경 이력</h3>
            </div>
            <div className="audit-export-actions">
              <span>
                {auditFilterActive ? `${filteredAuditLogs.length}/${state.auditLogs.length}건` : `${state.auditLogs.length}건`}
              </span>
              <button
                type="button"
                disabled={!canSecureBackup || auditExporting}
                onClick={exportAuditLogFiles}
                data-smoke="audit-export-download"
              >
                <Download size={15} aria-hidden />
                {auditExporting ? "내려받는 중" : "JSON/CSV 저장"}
              </button>
            </div>
          </div>
          {auditExportMessage && (
            <p className="quiet-text" role="status" aria-live="polite" data-smoke="audit-export-message">
              {auditExportMessage}
            </p>
          )}
          {auditExportError && (
            <p className="form-error" role="alert" data-smoke="audit-export-error">
              {auditExportError}
            </p>
          )}
          <div className="service-notice-form" data-smoke="audit-log-filters">
            <label>
              검색
              <input
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                placeholder="요약, action, metadata"
                data-smoke="audit-filter-search"
              />
            </label>
            <label>
              액션
              <select
                value={auditActionFilter}
                onChange={(event) => setAuditActionFilter(event.target.value)}
                data-smoke="audit-filter-action"
              >
                <option value="">전체 action</option>
                {auditActionOptions.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabels[action] ?? action}
                  </option>
                ))}
              </select>
            </label>
            <label>
              대상
              <select
                value={auditTargetTypeFilter}
                onChange={(event) => setAuditTargetTypeFilter(event.target.value)}
                data-smoke="audit-filter-target-type"
              >
                <option value="">전체 type</option>
                {auditTargetTypeOptions.map((targetType) => (
                  <option key={targetType} value={targetType}>
                    {targetType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              담당자
              <input
                value={auditActorFilter}
                onChange={(event) => setAuditActorFilter(event.target.value)}
                placeholder="이름, ID, 역할"
                data-smoke="audit-filter-actor"
              />
            </label>
            <label>
              날짜
              <input
                type="date"
                value={auditDateFilter}
                onChange={(event) => setAuditDateFilter(event.target.value)}
                data-smoke="audit-filter-date"
              />
            </label>
            <div className="service-notice-actions">
              <button
                type="button"
                disabled={!auditFilterActive}
                onClick={() => {
                  setAuditSearch("");
                  setAuditActionFilter("");
                  setAuditTargetTypeFilter("");
                  setAuditActorFilter("");
                  setAuditDateFilter("");
                }}
                data-smoke="audit-filter-reset"
              >
                <RotateCcw size={15} aria-hidden />
                필터 초기화
              </button>
            </div>
          </div>
          <p className="quiet-text" data-smoke="audit-retention-status">
            보존 한계 {AUDIT_LOG_RETENTION_LIMIT.toLocaleString()}건 중 {state.auditLogs.length.toLocaleString()}건 사용 · {auditRetentionPercent}%
            {auditRetentionNearLimit ? " · 한계에 가까워 오래된 로그가 곧 밀려날 수 있습니다." : " · 최근 로그 중심으로 보존 중입니다."}
          </p>
          <div className="audit-log-list">
            {auditLogs.length === 0 && (
              <EmptyState
                title={auditFilterActive ? "필터 결과 없음" : "감사 로그 없음"}
                body={auditFilterActive ? "조건을 줄이거나 필터를 초기화해보세요." : "운영 조치가 발생하면 최근 이력이 이곳에 기록됩니다."}
              />
            )}
            {filteredAuditLogs.length > auditLogs.length && (
              <p className="quiet-text">필터 결과 {filteredAuditLogs.length}건 중 최근 {auditLogs.length}건만 표시합니다.</p>
            )}
            {auditLogs.map((log) => {
              const metadata = formatAuditMetadata(log.metadata);
              return (
                <article className="audit-log-row" key={log.id}>
                  <span className="audit-log-icon" aria-hidden>
                    <History size={16} />
                  </span>
                  <div>
                    <strong>{log.summary}</strong>
                    <span>
                      {log.actorName} · {roleLabels[log.actorRole] ?? log.actorRole} · {log.createdAt}
                    </span>
                    {metadata && <small>{metadata}</small>}
                  </div>
                  <b>{auditActionLabels[log.action] ?? log.action}</b>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

const readinessStatusLabels: Record<ReadinessStatus, string> = {
  ready: "준비",
  warning: "주의",
  blocked: "막힘",
};

function readinessIcon(id: string) {
  if (id === "process_lifecycle") return <Clock3 size={17} aria-hidden />;
  if (id === "storage") return <Database size={17} aria-hidden />;
  if (id === "oauth") return <LogIn size={17} aria-hidden />;
  if (id === "sms") return <Phone size={17} aria-hidden />;
  if (id === "ai_judge") return <Brain size={17} aria-hidden />;
  if (id === "security") return <ShieldCheck size={17} aria-hidden />;
  if (id === "abuse_limits") return <ShieldCheck size={17} aria-hidden />;
  if (id === "security_headers") return <ShieldCheck size={17} aria-hidden />;
  if (id === "static_app") return <Home size={17} aria-hidden />;
  if (id === "origins") return <Globe2 size={17} aria-hidden />;
  if (id === "voice_permissions") return <Mic size={17} aria-hidden />;
  if (id === "realtime") return <Radio size={17} aria-hidden />;
  return <Settings size={17} aria-hidden />;
}

const readinessGuides: Record<string, ReadinessGuide> = {
  process_lifecycle: {
    title: "Process lifecycle",
    body: "Expose the running process, uptime, graceful shutdown window, and /api/health shutdown behavior before deploy.",
    envSnippet: ["API_PORT=4000", "SHUTDOWN_GRACE_MS=8000", "DEBATE_CLOCK_TICK_MS=1000"].join("\n"),
    steps: [
      "Keep SHUTDOWN_GRACE_MS lower than the platform stop timeout.",
      "Confirm /api/health exposes runtime.process and returns 503 while the process is shutting down.",
      "Run npm run smoke:lifecycle before promotion.",
    ],
  },
  storage: {
    title: "Supabase 저장소 전환",
    body: "앱 상태를 파일이 아니라 Supabase 정규 테이블에 저장하도록 고정합니다.",
    envSnippet: [
      "SUPABASE_URL=https://your-project-ref.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
      "SUPABASE_TABLE_PREFIX=nb_",
      "SUPABASE_STORAGE_MODE=normalized",
    ].join("\n"),
    steps: [
      "Supabase SQL Editor에서 supabase/normalized-schema.sql을 실행합니다.",
      "서버 전용 Service Role Key를 환경변수에 넣습니다.",
      "운영 탭의 Supabase 연결 점검에서 모든 테이블 row 수를 확인합니다.",
    ],
  },
  oauth: {
    title: "실제 간편 로그인 연결",
    body: "Supabase Auth OAuth로 Google, Apple, Kakao 로그인을 연결하고, Naver는 별도 OAuth 콜백 확장 대상으로 둡니다.",
    envSnippet: [
      "VITE_SUPABASE_URL=https://your-project-ref.supabase.co",
      "VITE_SUPABASE_ANON_KEY=your-supabase-anon-key",
      "SUPABASE_URL=https://your-project-ref.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
    ].join("\n"),
    steps: [
      "Supabase Dashboard의 Authentication > Providers에서 Google, Apple, Kakao를 활성화합니다.",
      "각 provider의 redirect URL에 서비스 도메인을 등록합니다.",
      "Naver는 Supabase 기본 provider가 아니면 별도 OAuth callback API로 추가 구현합니다.",
    ],
  },
  sms: {
    title: "실제 SMS 인증 전환",
    body: "개발용 인증번호 노출을 끄고 SOLAPI 문자 발송으로 전화번호 인증을 진행합니다.",
    envSnippet: [
      "SMS_PROVIDER=solapi",
      "SOLAPI_API_KEY=your-solapi-api-key",
      "SOLAPI_API_SECRET=your-solapi-api-secret",
      "SOLAPI_SENDER_NUMBER=01000000000",
      "PHONE_CODE_HIDE_DEBUG=true",
    ].join("\n"),
    steps: [
      "SOLAPI 콘솔에서 API Key와 Secret을 발급합니다.",
      "문자 발신번호를 사전 등록하고 승인 상태를 확인합니다.",
      "운영 준비도에서 전화번호 SMS 인증이 준비 상태로 바뀌는지 확인합니다.",
    ],
  },
  ai_judge: {
    title: "AI 판정 활성화",
    body: "토론 종료 후 관전자 투표와 AI 분석을 합산해 최종 승자를 계산합니다.",
    envSnippet: ["OPENAI_API_KEY=your-openai-api-key", "OPENAI_JUDGE_MODEL=gpt-4o-mini"].join("\n"),
    steps: [
      "서버 환경변수에 OpenAI API 키를 추가합니다.",
      "헬스 체크에서 aiJudgeConfigured가 true인지 확인합니다.",
      "투표 단계 채널에서 AI 판정 실행이 정상 완료되는지 테스트합니다.",
    ],
  },
  security: {
    title: "운영 보안 스위치 잠금",
    body: "데모 계정 전환과 익명 상태 쓰기를 막아 운영 데이터가 임의로 바뀌지 않게 합니다.",
    envSnippet: [
      "NODE_ENV=production",
      "ENABLE_DEMO_AUTH=false",
      "ENABLE_OPEN_STATE_WRITE=false",
      "PHONE_CODE_HIDE_DEBUG=true",
      "SESSION_SECRET=replace-with-long-random-secret",
    ].join("\n"),
    steps: [
      "배포 서버의 NODE_ENV를 production으로 설정합니다.",
      "데모 전환과 공개 상태 쓰기를 명시적으로 false로 둡니다.",
      "SESSION_SECRET은 충분히 긴 랜덤 문자열로 고정합니다.",
    ],
  },
  abuse_limits: {
    title: "Auth/SMS 남용 방지 한도",
    body: "로그인, 가입, SMS 인증, 메시지/신고 요청이 단시간에 반복될 때 API가 429와 Retry-After로 차단하도록 확인합니다.",
    envSnippet: [
      "RATE_LIMIT_AUTH_WINDOW_SECONDS=600",
      "RATE_LIMIT_LOGIN_MAX=8",
      "RATE_LIMIT_SIGNUP_MAX=5",
      "RATE_LIMIT_PHONE_REQUEST_MAX=5",
      "RATE_LIMIT_PHONE_VERIFY_MAX=10",
      "RATE_LIMIT_WRITE_WINDOW_SECONDS=60",
      "RATE_LIMIT_MESSAGE_MAX=30",
      "RATE_LIMIT_REPORT_MAX=10",
    ].join("\n"),
    steps: [
      "운영 탭의 Auth/SMS/Write limit 숫자가 모두 양수인지 확인합니다.",
      "GET /api/health의 runtime.rateLimits가 배포 env 값과 일치하는지 확인합니다.",
      "npm run smoke:auth로 로그인 rate limit 429와 Retry-After 응답을 검증합니다.",
    ],
  },
  security_headers: {
    title: "HTTP 보안 헤더 확인",
    body: "브라우저가 API 응답을 해석할 때 불필요한 노출과 삽입 위험을 줄이는 기본 헤더를 적용합니다.",
    envSnippet: ["# 별도 환경변수 없음", "npm run smoke"].join("\n"),
    steps: [
      "API 응답에서 X-Powered-By가 노출되지 않는지 확인합니다.",
      "X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy가 적용되는지 확인합니다.",
      "npm run smoke로 보안 헤더 회귀 검사를 반복합니다.",
    ],
  },
  origins: {
    title: "배포 Origin 잠금",
    body: "운영 API가 실제 프론트엔드 도메인의 브라우저 요청만 세션 쿠키와 함께 받을 수 있게 제한합니다.",
    envSnippet: ["API_HOST=0.0.0.0", "ALLOWED_ORIGINS=https://your-service.example.com"].join("\n"),
    steps: [
      "배포 서버에서는 API_HOST를 0.0.0.0으로 설정합니다.",
      "ALLOWED_ORIGINS에는 실제 HTTPS 프론트엔드 도메인만 쉼표로 구분해 넣습니다.",
      "운영 도메인 전환 후 npm run smoke의 CORS 허용/차단 검사가 통과하는지 확인합니다.",
    ],
  },
  static_app: {
    title: "Express 단일 서버 배포",
    body: "Vite 빌드 산출물을 Express API 서버가 함께 서빙해 별도 프론트 서버 없이 1차 MVP를 띄울 수 있게 합니다.",
    envSnippet: ["NODE_ENV=production", "SERVE_STATIC_APP=true", "API_HOST=0.0.0.0", "npm run build", "npm start"].join("\n"),
    steps: [
      "배포 전에 npm run build로 dist/index.html과 assets를 생성합니다.",
      "프로덕션 서버에서는 SERVE_STATIC_APP=true와 NODE_ENV=production으로 npm start를 실행합니다.",
      "npm run smoke:static으로 /, 딥링크 fallback, /api/health가 같은 Express 서버에서 응답하는지 확인합니다.",
    ],
  },
  voice_permissions: {
    title: "음성 토론 마이크 권한",
    body: "프로덕션에서 Express가 프론트를 직접 서빙할 때도 브라우저가 같은 출처의 마이크 접근을 허용해야 음성 토론을 시작할 수 있습니다.",
    envSnippet: ["# 서버 기본값으로 적용됩니다.", "Permissions-Policy: camera=(), microphone=(self), geolocation=()"].join("\n"),
    steps: [
      "배포 응답 헤더의 Permissions-Policy에 microphone=(self)가 포함되는지 확인합니다.",
      "camera와 geolocation은 계속 차단해 불필요한 브라우저 권한 노출을 막습니다.",
      "npm run smoke와 npm run smoke:static으로 API와 정적 앱 응답 헤더를 함께 검증합니다.",
    ],
  },
  realtime: {
    title: "실시간 연결 확인",
    body: "관전 채팅, 투표, 토론 상태가 브라우저 간에 즉시 동기화되는지 확인합니다.",
    envSnippet: ["API_PORT=4000", "VITE_API_BASE=/api"].join("\n"),
    steps: [
      "두 개의 브라우저에서 같은 채널을 열고 관전 채팅을 보냅니다.",
      "한쪽의 투표, 공감, 토론 단계 변경이 다른 쪽에 반영되는지 확인합니다.",
      "배포 환경에서는 WebSocket 프록시가 Socket.IO를 막지 않는지 확인합니다.",
    ],
  },
};

function ReadinessPanel({
  readiness,
  readinessBusy,
  readinessMessage,
  readinessError,
  canManage,
  onRefresh,
}: {
  readiness: OperationalReadinessResult | null;
  readinessBusy: boolean;
  readinessMessage: string;
  readinessError: string;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const selectedItem =
    readiness?.checks.find((item) => item.id === selectedGuideId) ??
    readiness?.checks.find((item) => item.status !== "ready") ??
    readiness?.checks[0] ??
    null;
  const selectedGuide = readinessGuides[selectedItem?.id ?? selectedGuideId] ?? readinessGuides.sms;
  const scoreTone =
    !readiness
      ? "neutral"
      : readiness.summary.blocked > 0
        ? "blocked"
        : readiness.summary.warning > 0
          ? "warning"
          : "ready";
  const statusCopy =
    !readiness
      ? "점검 전"
      : readiness.summary.blocked > 0
        ? `${readiness.summary.blocked}개 막힘`
        : readiness.summary.warning > 0
        ? `${readiness.summary.warning}개 주의`
        : "운영 준비";
  const allowedOrigins = readiness?.runtime.allowedOrigins ?? [];
  const allowedOriginPreview =
    !readiness
      ? "Origin 확인 전"
      : allowedOrigins.length === 0
        ? "등록 없음"
        : allowedOrigins.length === 1
          ? allowedOrigins[0]
          : `${allowedOrigins[0]} 외 ${allowedOrigins.length - 1}개`;
  const apiHostCopy = readiness?.runtime.apiHost ? `API ${readiness.runtime.apiHost}` : "API 확인 전";
  const requiredOpenCount = readiness?.launch.requiredOpen?.length ?? 0;
  const recommendedOpenCount = readiness?.launch.recommendedOpen?.length ?? 0;
  const phaseSummary = readiness?.launch.phaseSummary ?? [];
  const launchCommands = readiness?.launch.commands ?? [];
  const launchEvidence = readiness?.launch.evidence;
  const launchHandoff = readiness?.launch.handoff;
  const promotionGate = readiness?.launch.promotionGate;
  const rateLimits = readiness?.runtime.rateLimits;
  const processRuntime = readiness?.runtime.process;
  const providerDiagnostics = readiness?.runtime.providerDiagnostics;
  const releaseRuntime = readiness?.runtime.release;
  const promotionGateArtifacts = promotionGate?.artifacts ?? [];

  useEffect(() => {
    if (!readiness) return;
    const firstActionable = readiness.checks.find((item) => item.status !== "ready") ?? readiness.checks[0];
    if (firstActionable && (!selectedGuideId || !readiness.checks.some((item) => item.id === selectedGuideId))) {
      setSelectedGuideId(firstActionable.id);
    }
  }, [readiness, selectedGuideId]);

  const copyGuideEnv = async () => {
    setCopyMessage("");
    try {
      await navigator.clipboard.writeText(selectedGuide.envSnippet);
      setCopyMessage("환경변수 예시를 복사했습니다.");
    } catch {
      setCopyMessage("브라우저가 복사를 막았습니다. 아래 내용을 직접 선택해주세요.");
    }
  };

  const copyLaunchEnv = async () => {
    const launchEnvText = readiness?.launch.envTemplate || readiness?.launch.env.join("\n") || "";
    if (!launchEnvText) return;
    setCopyMessage("");
    try {
      await navigator.clipboard.writeText(launchEnvText);
      setCopyMessage("런칭에 필요한 환경변수 목록을 복사했습니다.");
    } catch {
      setCopyMessage("브라우저가 복사를 막았습니다. 런칭 카드의 환경변수 목록을 직접 선택해주세요.");
    }
  };

  const copyLaunchCommands = async () => {
    const commandsText = launchCommands.map((item) => `${item.label}\n${item.command}`).join("\n\n");
    if (!commandsText) return;
    setCopyMessage("");
    try {
      await navigator.clipboard.writeText(commandsText);
      setCopyMessage("배포 런북 명령을 복사했습니다.");
    } catch {
      setCopyMessage("브라우저가 복사를 막았습니다. 명령 목록을 직접 선택해주세요.");
    }
  };

  const downloadReadinessFile = (filename: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const downloadLaunchEnv = () => {
    const launchEnvText = readiness?.launch.envTemplate || readiness?.launch.env.join("\n") || "";
    if (!launchEnvText) return;
    downloadReadinessFile("nosu-best-production.env.example", `${launchEnvText}\n`, "text/plain;charset=utf-8");
    setCopyMessage("운영 env 초안을 저장했습니다.");
  };

  const downloadReadinessReport = () => {
    const report = readiness?.launch.report;
    if (!readiness || !report?.markdown) return;
    downloadReadinessFile(report.filename || `nosu-best-readiness-${new Date().toISOString().slice(0, 10)}.md`, report.markdown, "text/markdown;charset=utf-8");
    setCopyMessage("런칭 준비도 리포트를 저장했습니다.");
  };

  const downloadReadinessJson = () => {
    if (!readiness) return;
    const filename = readiness.launch.report?.jsonFilename || `nosu-best-readiness-${new Date().toISOString().slice(0, 10)}.json`;
    downloadReadinessFile(filename, JSON.stringify(readiness, null, 2), "application/json;charset=utf-8");
    setCopyMessage("런칭 준비도 JSON을 저장했습니다.");
  };

  const downloadLaunchEvidence = () => {
    if (!readiness) return;
    const filename =
      launchEvidence?.packageFilename || `nosu-best-launch-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    const payload = {
      type: "nosu-best-launch-evidence",
      generatedAt: launchEvidence?.generatedAt || new Date().toISOString(),
      status: readiness.launch.status,
      summary: readiness.summary,
      runtime: readiness.runtime,
      service: readiness.service,
      launch: {
        label: readiness.launch.label,
        headline: readiness.launch.headline,
        blockers: readiness.launch.blockers,
        warnings: readiness.launch.warnings,
        requiredOpen: readiness.launch.requiredOpen,
        recommendedOpen: readiness.launch.recommendedOpen,
        nextActions: readiness.launch.nextActions,
        env: readiness.launch.env,
        commands: readiness.launch.commands,
        report: readiness.launch.report,
        evidence: launchEvidence,
        promotionGate,
      },
      checks: readiness.checks,
    };
    downloadReadinessFile(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setCopyMessage("런칭 증적 패키지를 저장했습니다.");
  };

  const downloadLaunchHandoff = () => {
    if (!readiness || !launchHandoff) return;
    const payload = {
      type: "nosu-best-launch-handoff",
      generatedAt: launchHandoff.generatedAt,
      readiness: {
        checkedAt: readiness.checkedAt,
        status: readiness.launch.status,
        summary: readiness.summary,
      },
      service: readiness.service,
      handoff: launchHandoff,
    };
    downloadReadinessFile(launchHandoff.filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setCopyMessage("Launch handoff package saved.");
  };

  return (
    <section className="readiness-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">운영 준비도</p>
          <h3>서비스 런칭 체크리스트</h3>
          <p>SMS, AI 판정, 저장소, 보안 스위치가 운영 기준에 맞는지 확인합니다.</p>
        </div>
        <span className={`readiness-score ${scoreTone}`}>
          <ShieldCheck size={16} aria-hidden />
          {readiness ? `${readiness.summary.score}점` : "대기"}
        </span>
      </div>

      <div className="readiness-hero">
        <div>
          <span>현재 상태</span>
          <strong>{statusCopy}</strong>
          <small>{readiness?.checkedAt ? `${formatDateTime(readiness.checkedAt)} 점검` : "운영 탭 진입 시 자동 점검"}</small>
        </div>
        <div className="readiness-runtime">
          <span>{readiness?.runtime.nodeEnv ?? "development"}</span>
          <span>{apiHostCopy}</span>
          <span>{readiness ? `Origin ${allowedOrigins.length}개` : "Origin 확인 전"}</span>
          <span>{processRuntime ? `PID ${processRuntime.pid}` : "Process 확인 전"}</span>
          <span>{releaseRuntime ? `Release ${releaseRuntime.commitShort}` : "Release 확인 전"}</span>
          <span>{processRuntime ? `Grace ${processRuntime.shutdownGraceMs}ms` : "Grace 확인 전"}</span>
          <span>{readiness?.service.storageMode ?? "저장소 확인 전"}</span>
          <span>{readiness?.service.smsProvider ?? "SMS 확인 전"}</span>
        </div>
      </div>

      {readiness && (
        <div
          className={`readiness-launch-card ${readiness.launch.status}`}
          data-smoke="readiness-launch-card"
          data-launch-status={readiness.launch.status}
          data-launch-blockers={readiness.launch.blockers.length}
          data-launch-warnings={readiness.launch.warnings.length}
        >
          <div className="readiness-launch-copy">
            <span>런칭 판단</span>
            <strong>{readiness.launch.label}</strong>
            <p>{readiness.launch.headline}</p>
          </div>
          <div className="readiness-launch-counts">
            <span>
              <b>{readiness.launch.blockers.length}</b>
              막힘
            </span>
            <span>
              <b>{readiness.launch.warnings.length}</b>
              주의
            </span>
            <span>
              <b>{readiness.summary.ready}</b>
              준비
            </span>
            <span>
              <b>{requiredOpenCount}</b>
              필수 미완료
            </span>
            <span>
              <b>{recommendedOpenCount}</b>
              권장 확인
            </span>
          </div>
          {readiness.launch.nextActions.length > 0 && (
            <ol className="readiness-launch-actions">
              {readiness.launch.nextActions.slice(0, 3).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          )}
          {readiness.launch.env.length > 0 && (
            <div
              className="readiness-launch-env"
              data-smoke="readiness-launch-env"
              data-env-count={readiness.launch.env.length}
              data-has-env-template={readiness.launch.envTemplate ? "true" : "false"}
            >
              <code>{readiness.launch.env.join(", ")}</code>
              <button type="button" onClick={copyLaunchEnv}>
                <Copy size={15} aria-hidden />
                필수 env 복사
              </button>
            </div>
          )}
          {readiness.launch.env.length > 0 && (
            <div className="readiness-env-actions">
              <button type="button" onClick={downloadLaunchEnv} data-smoke="readiness-env-download">
                <Download size={15} aria-hidden />
                env 초안 저장
              </button>
            </div>
          )}
          {launchCommands.length > 0 && (
            <div
              className="readiness-command-strip"
              data-smoke="readiness-command-strip"
              data-command-count={launchCommands.length}
            >
              <div>
                <span>배포 런북</span>
                <strong>검증부터 운영 시작까지</strong>
              </div>
              <div className="readiness-command-list">
                {launchCommands.map((item) => (
                  <code key={item.id} data-command-id={item.id} title={item.detail}>
                    {item.command}
                  </code>
                ))}
              </div>
              <button type="button" onClick={copyLaunchCommands} data-smoke="readiness-command-copy">
                <Copy size={15} aria-hidden />
                명령 복사
              </button>
            </div>
          )}
          {launchEvidence?.checklist?.length ? (
            <div
              className="readiness-evidence-strip"
              data-smoke="readiness-evidence-strip"
              data-evidence-count={launchEvidence.checklist.length}
            >
              <div>
                <span>런칭 증적</span>
                <strong>배포 전 저장할 파일</strong>
              </div>
              <ul>
                {launchEvidence.checklist.map((item) => (
                  <li key={item.id} data-evidence-id={item.id}>
                    <b>{item.label}</b>
                    <code>{item.artifact}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {promotionGate ? (
            <div
              className={`readiness-promotion-gate ${promotionGate.status}`}
              data-smoke="readiness-promotion-gate"
              data-promotion-status={promotionGate.status}
              data-artifact-count={promotionGateArtifacts.length}
              data-ready-artifacts={promotionGate.readyCount}
            >
              <div className="readiness-promotion-copy">
                <span>Final promotion gate</span>
                <strong>{promotionGate.label}</strong>
                <p>{promotionGate.detail}</p>
                <em>
                  {promotionGate.readyCount}/{promotionGate.requiredCount} ready · max age {promotionGate.maxAgeHours}h
                </em>
              </div>
              {promotionGate.strict ? (
                <div
                  className={`readiness-promotion-strict ${promotionGate.strict.status}`}
                  data-smoke="readiness-promotion-strict"
                  data-strict-status={promotionGate.strict.status}
                  data-local-ready={promotionGate.strict.localReady ? "true" : "false"}
                  data-strict-ready={promotionGate.strict.ready ? "true" : "false"}
                >
                  <strong>{promotionGate.strict.label}</strong>
                  <span>mode: {promotionGate.strict.currentMode}</span>
                  <p>{promotionGate.strict.detail}</p>
                  <code>{promotionGate.strict.command}</code>
                </div>
              ) : null}
              <ul>
                {promotionGateArtifacts.map((artifact) => (
                  <li
                    key={artifact.id}
                    className={artifact.ok ? "ready" : artifact.blocking ? "blocked" : "partial"}
                    data-promotion-artifact-id={artifact.id}
                  >
                    <b>{artifact.label}</b>
                    <span>{artifact.ok ? "ready" : artifact.status}</span>
                    <code>{artifact.path}</code>
                    <em>{artifact.detail}</em>
                  </li>
                ))}
              </ul>
              {promotionGate.nextActions.length > 0 && (
                <ol>
                  {promotionGate.nextActions.slice(0, 3).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
          {launchHandoff ? (
            <div
              className={`readiness-handoff-strip ${launchHandoff.status}`}
              data-smoke="readiness-handoff-strip"
              data-handoff-status={launchHandoff.status}
              data-handoff-check-count={launchHandoff.checklist.length}
              data-handoff-can-launch={launchHandoff.goNoGo.canLaunch ? "true" : "false"}
            >
              <div>
                <span>Launch handoff</span>
                <strong>{launchHandoff.label}</strong>
                <p>{launchHandoff.summary}</p>
                <em>
                  required {launchHandoff.goNoGo.requiredOpen} · blockers {launchHandoff.goNoGo.blockers} · strict{" "}
                  {launchHandoff.goNoGo.strictReady ? "ready" : "pending"}
                </em>
              </div>
              <ul>
                {launchHandoff.checklist.slice(0, 4).map((item) => (
                  <li key={item.id} className={item.status} data-handoff-check-id={item.id}>
                    <b>{item.label}</b>
                    <span>{item.status}</span>
                    <em>{item.detail}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="readiness-report-actions">
            <button type="button" onClick={downloadReadinessReport} data-smoke="readiness-report-download">
              <Download size={15} aria-hidden />
              리포트 저장
            </button>
            <button type="button" onClick={downloadLaunchEvidence} data-smoke="readiness-evidence-download">
              <Download size={15} aria-hidden />
              증적 패키지 저장
            </button>
            {launchHandoff ? (
              <button type="button" onClick={downloadLaunchHandoff} data-smoke="readiness-handoff-download">
                <Download size={15} aria-hidden />
                handoff 저장
              </button>
            ) : null}
            <button type="button" onClick={downloadReadinessJson} data-smoke="readiness-json-download">
              <Download size={15} aria-hidden />
              JSON 저장
            </button>
          </div>
        </div>
      )}

      {readiness && phaseSummary.length > 0 && (
        <div
          className="readiness-phase-strip"
          data-smoke="readiness-phase-strip"
          data-phase-count={phaseSummary.length}
          data-required-open={requiredOpenCount}
        >
          {phaseSummary.map((phase) => (
            <span key={phase.phase} className={phase.requiredOpen > 0 ? "attention" : "ready"}>
              <b>{phase.label}</b>
              <em>
                {phase.ready}/{phase.total} 준비
                {phase.requiredOpen > 0 ? ` · 필수 ${phase.requiredOpen}` : ""}
              </em>
            </span>
          ))}
        </div>
      )}

      {readiness && (
        <div className="readiness-deploy-strip" aria-label="배포 런타임 설정">
          <span
            data-smoke="readiness-release-identity"
            data-release-configured={releaseRuntime?.configured ? "true" : "false"}
            data-release-version={releaseRuntime?.version ?? ""}
            data-release-commit={releaseRuntime?.commitShort ?? ""}
          >
            <History size={15} aria-hidden />
            <b>Release</b>
            <em>
              {releaseRuntime
                ? `${releaseRuntime.version} · ${releaseRuntime.commitShort} · ${releaseRuntime.channel}`
                : "not checked"}
            </em>
          </span>
          <span>
            <Globe2 size={15} aria-hidden />
            <b>API 바인딩</b>
            <em>{readiness.runtime.apiHost}</em>
          </span>
          <span
            data-smoke="readiness-process-runtime"
            data-process-pid={processRuntime?.pid ?? ""}
            data-process-shutting-down={processRuntime?.shuttingDown ? "true" : "false"}
          >
            <Clock3 size={15} aria-hidden />
            <b>Process</b>
            <em>
              {processRuntime
                ? `${processRuntime.uptimeSeconds}s up / ${processRuntime.shutdownGraceMs}ms grace`
                : "not checked"}
            </em>
          </span>
          <span>
            <ShieldCheck size={15} aria-hidden />
            <b>허용 Origin</b>
            <em>{allowedOriginPreview}</em>
          </span>
        </div>
      )}

      {readiness && rateLimits && (
        <div
          className="readiness-rate-strip"
          data-smoke="readiness-rate-strip"
          data-login-max={rateLimits.loginMax}
          data-phone-request-max={rateLimits.phoneRequestMax}
          data-message-max={rateLimits.messageMax}
        >
          <span>
            <ShieldCheck size={15} aria-hidden />
            <b>Auth limit</b>
            <em>login {rateLimits.loginMax}/{rateLimits.authWindowSeconds}s</em>
          </span>
          <span>
            <Phone size={15} aria-hidden />
            <b>SMS limit</b>
            <em>request {rateLimits.phoneRequestMax}/{rateLimits.authWindowSeconds}s</em>
          </span>
          <span>
            <MessageSquare size={15} aria-hidden />
            <b>Write limit</b>
            <em>message {rateLimits.messageMax}/{rateLimits.writeWindowSeconds}s</em>
          </span>
        </div>
      )}

      {readiness && providerDiagnostics && (
        <div
          className="readiness-provider-strip"
          data-smoke="readiness-provider-strip"
          data-sms-ready={providerDiagnostics.sms.productionReady ? "true" : "false"}
          data-oauth-ready={providerDiagnostics.oauth.productionReady ? "true" : "false"}
          data-ai-ready={providerDiagnostics.ai.productionReady ? "true" : "false"}
          data-storage-ready={providerDiagnostics.storage.productionReady ? "true" : "false"}
          data-storage-mode={providerDiagnostics.storage.storageMode}
          data-sms-provider={providerDiagnostics.sms.provider}
        >
          <span>
            <Phone size={15} aria-hidden />
            <b>SMS provider</b>
            <em>{providerDiagnostics.sms.productionReady ? "SOLAPI ready" : `${providerDiagnostics.sms.provider} mode`}</em>
          </span>
          <span>
            <KeyRound size={15} aria-hidden />
            <b>OAuth</b>
            <em>{providerDiagnostics.oauth.productionReady ? "Supabase ready" : "needs keys"}</em>
          </span>
          <span>
            <Brain size={15} aria-hidden />
            <b>AI judge</b>
            <em>{providerDiagnostics.ai.productionReady ? providerDiagnostics.ai.model : "local fallback"}</em>
          </span>
          <span>
            <Database size={15} aria-hidden />
            <b>Storage</b>
            <em>{providerDiagnostics.storage.productionReady ? "normalized" : providerDiagnostics.storage.storageMode}</em>
          </span>
        </div>
      )}

      <div className="readiness-check-grid">
        {(readiness?.checks ?? []).map((item) => (
          <button
            className={`readiness-check-card ${item.status} ${selectedItem?.id === item.id ? "selected" : ""}`}
            key={item.id}
            type="button"
            onClick={() => {
              setSelectedGuideId(item.id);
              setCopyMessage("");
            }}
          >
            <span className="readiness-check-icon">{readinessIcon(item.id)}</span>
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              {item.action && <small>{item.action}</small>}
            </div>
            {item.priority && (
              <em className={`readiness-priority ${item.priority}`}>
                {item.required ? "필수" : "권장"}
              </em>
            )}
            <b>{readinessStatusLabels[item.status]}</b>
          </button>
        ))}
        {!readiness && (
          <div className="readiness-empty">
            <Clock3 size={18} aria-hidden />
            <span>점검 결과를 불러오는 중입니다.</span>
          </div>
        )}
      </div>

      {readiness && (
        <div className="readiness-service-strip">
          <span>AI {readiness.service.aiJudgeConfigured ? readiness.service.judgeModel : "미설정"}</span>
          <span>실시간 {readiness.service.clients.toLocaleString()}명 연결</span>
          <span>사용자 {readiness.service.users.toLocaleString()}명</span>
          <span>채널 {readiness.service.channels.toLocaleString()}개</span>
        </div>
      )}

      {readiness && selectedItem && (
        <div className="readiness-guide-panel">
          <div className="readiness-guide-head">
            <div>
              <span>{selectedItem.label}</span>
              <strong>{selectedGuide.title}</strong>
              <p>{selectedGuide.body}</p>
            </div>
            <span className={`readiness-guide-status ${selectedItem.status}`}>
              {readinessStatusLabels[selectedItem.status]}
            </span>
          </div>
          <pre>{selectedGuide.envSnippet}</pre>
          <div className="readiness-guide-steps">
            {selectedGuide.steps.map((step, index) => (
              <span key={step}>
                <b>{index + 1}</b>
                {step}
              </span>
            ))}
          </div>
          <div className="readiness-guide-actions">
            <button type="button" onClick={copyGuideEnv}>
              <Copy size={16} aria-hidden />
              환경변수 복사
            </button>
          </div>
          {copyMessage && <p className="quiet-text">{copyMessage}</p>}
        </div>
      )}

      <div className="storage-actions readiness-actions">
        <button type="button" disabled={!canManage || readinessBusy} onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden />
          {readinessBusy ? "점검 중" : "준비도 새로고침"}
        </button>
      </div>
      {readinessMessage && <p className="quiet-text">{readinessMessage}</p>}
      {readinessError && <p className="form-error">{readinessError}</p>}
    </section>
  );
}

function StorageOpsPanel({
  storageCheck,
  storageBusy,
  storageMessage,
  storageError,
  backupFileName,
  backupValidation,
  secureBackupConfirmation,
  restoreBackupConfirmation,
  canManage,
  canSecureBackup,
  onRefresh,
  onExport,
  onSecureExport,
  onSecureBackupConfirmationChange,
  onValidateBackup,
  onRestoreBackup,
  onRestoreBackupConfirmationChange,
  onSync,
  onSeed,
}: {
  storageCheck: StorageCheckResult | null;
  storageBusy: "check" | "export" | "secure-export" | "validate" | "restore" | "sync" | "seed" | "";
  storageMessage: string;
  storageError: string;
  backupFileName: string;
  backupValidation: StateBackupValidationResult | null;
  secureBackupConfirmation: string;
  restoreBackupConfirmation: string;
  canManage: boolean;
  canSecureBackup: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onSecureExport: () => void;
  onSecureBackupConfirmationChange: (value: string) => void;
  onValidateBackup: (file: File | null) => void;
  onRestoreBackup: () => void;
  onRestoreBackupConfirmationChange: (value: string) => void;
  onSync: () => void;
  onSeed: () => void;
}) {
  const tableChecks = storageCheck?.tables ?? [];
  const failingTables = tableChecks.filter((table) => !table.ok);
  const mismatchedTables = tableChecks.filter(
    (table) => table.ok && table.count !== null && table.expectedCount !== undefined && table.count !== table.expectedCount,
  );
  const readyTables = tableChecks.filter(
    (table) => table.ok && table.count !== null && table.expectedCount !== undefined && table.count === table.expectedCount,
  );
  const statusLabel = storageCheck
    ? storageCheck.storage === "supabase"
      ? storageCheck.normalized
        ? "Supabase 정규 테이블"
        : "Supabase 스냅샷"
      : "파일 저장소"
    : "점검 전";
  const statusTone =
    !storageCheck || failingTables.length > 0
      ? "warning"
      : mismatchedTables.length > 0
        ? "caution"
        : storageCheck.storage === "supabase"
          ? "good"
          : "neutral";
  const restoreReady = Boolean(canSecureBackup && backupValidation?.valid && backupValidation.secretsIncluded);

  return (
    <section
      className="storage-ops-panel"
      data-smoke="storage-ops-panel"
      data-storage-mode={storageCheck?.storageMode ?? ""}
      data-storage-users={storageCheck?.appState?.users ?? ""}
      data-storage-rooms={storageCheck?.appState?.rooms ?? ""}
      data-storage-channels={storageCheck?.appState?.channels ?? ""}
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">저장소</p>
          <h3>Supabase 연결 점검</h3>
          <p>운영 전환 전에 현재 저장 방식과 정규 테이블 상태를 확인합니다.</p>
        </div>
        <span className={`storage-status ${statusTone}`}>
          <Database size={16} aria-hidden />
          {statusLabel}
        </span>
      </div>

      <div className="storage-summary-grid">
        <StorageSummaryCard label="현재 저장소" value={statusLabel} detail={storageCheck?.table ?? "점검 실행 필요"} />
        <StorageSummaryCard
          label="앱 데이터"
          value={
            storageCheck?.appState
              ? `${storageCheck.appState.users}명 · ${storageCheck.appState.channels}채널`
              : `${readyTables.length}/${tableChecks.length || 13} 테이블`
          }
          detail={storageCheck ? `예상 row ${storageCheck.expectedTotalRows.toLocaleString()}개` : "정규 테이블 기준으로 계산"}
        />
        <StorageSummaryCard
          label="테이블 상태"
          value={
            storageCheck
              ? failingTables.length > 0
                ? `${failingTables.length}개 오류`
                : mismatchedTables.length > 0
                  ? `${mismatchedTables.length}개 불일치`
                  : "정상"
              : "대기"
          }
          detail={storageCheck?.checkedAt ? formatDateTime(storageCheck.checkedAt) : "아직 점검하지 않음"}
        />
      </div>

      {storageCheck && (
        <div className="storage-table-list">
          {tableChecks.slice(0, 7).map((table) => (
            <StorageTableRow key={table.key ?? table.table} table={table} />
          ))}
          {tableChecks.length > 7 && <span className="storage-more">나머지 {tableChecks.length - 7}개 테이블도 점검 완료</span>}
          {!storageCheck.supabaseConfigured && (
            <p className="storage-note">Supabase 환경변수가 없어서 현재는 `data/state.json` 파일 저장소를 사용합니다.</p>
          )}
        </div>
      )}

      <label className="storage-secure-confirmation">
        <span>보안 백업 확인 문구</span>
        <input
          value={secureBackupConfirmation}
          placeholder={SECURE_BACKUP_CONFIRMATION}
          disabled={!canSecureBackup || Boolean(storageBusy)}
          data-smoke="storage-secure-backup-confirmation"
          onChange={(event) => onSecureBackupConfirmationChange(event.target.value)}
        />
        <small>credential 포함 백업은 admin만 내려받을 수 있고 감사 로그가 남습니다.</small>
      </label>

      <div className="storage-actions">
        <button type="button" disabled={!canManage || Boolean(storageBusy)} onClick={onRefresh} data-smoke="storage-check">
          <RefreshCw size={16} aria-hidden />
          {storageBusy === "check" ? "점검 중" : "점검 실행"}
        </button>
        <button type="button" disabled={!canManage || Boolean(storageBusy)} onClick={onExport} data-smoke="storage-export-backup">
          <Download size={16} aria-hidden />
          {storageBusy === "export" ? "백업 준비 중" : "백업 다운로드"}
        </button>
        <button
          type="button"
          disabled={!canSecureBackup || Boolean(storageBusy) || secureBackupConfirmation.trim() !== SECURE_BACKUP_CONFIRMATION}
          onClick={onSecureExport}
          data-smoke="storage-export-secure-backup"
        >
          <ShieldCheck size={16} aria-hidden />
          {storageBusy === "secure-export" ? "보안 백업 준비 중" : "보안 백업 다운로드"}
        </button>
        <label
          className={`storage-file-action${!canManage || Boolean(storageBusy) ? " disabled" : ""}`}
          aria-disabled={!canManage || Boolean(storageBusy)}
        >
          <ShieldCheck size={16} aria-hidden />
          {storageBusy === "validate" ? "백업 점검 중" : "백업 파일 점검"}
          <input
            type="file"
            accept="application/json"
            disabled={!canManage || Boolean(storageBusy)}
            data-smoke="storage-validate-backup"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              onValidateBackup(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={!canManage || Boolean(storageBusy) || (storageCheck ? !storageCheck.supabaseConfigured : false)}
          onClick={onSync}
          data-smoke="storage-sync-normalized"
        >
          <Database size={16} aria-hidden />
          {storageBusy === "sync" ? "동기화 중" : "정규 테이블 동기화"}
        </button>
        <button type="button" disabled={!canManage || Boolean(storageBusy)} onClick={onSeed} data-smoke="storage-seed-demo">
          <RotateCcw size={16} aria-hidden />
          {storageBusy === "seed" ? "복구 중" : "데모 시드 복구"}
        </button>
      </div>
      {backupValidation && (
        <div
          className={`storage-backup-validation ${backupValidation.valid ? "good" : "warning"}`}
          data-smoke="storage-backup-validation"
          data-backup-valid={backupValidation.valid ? "true" : "false"}
          data-backup-users={backupValidation.counts.users ?? 0}
          data-backup-rooms={backupValidation.counts.rooms ?? 0}
          data-backup-channels={backupValidation.counts.channels ?? 0}
        >
          <div>
            <strong>{backupValidation.valid ? "백업 파일 점검 통과" : "백업 파일 점검 필요"}</strong>
            <span>{backupFileName || "선택한 JSON 파일"}</span>
          </div>
          <p>
            사용자 {backupValidation.counts.users ?? 0}명, 방 {backupValidation.counts.rooms ?? 0}개, 채널{" "}
            {backupValidation.counts.channels ?? 0}개를 확인했습니다.
          </p>
          <small>
            {backupValidation.secretsIncluded
              ? "비밀번호 해시가 포함되어 있어 보관 위치를 제한해야 합니다."
              : "비밀번호 해시가 제외된 백업이므로 전체 복구 전 비밀번호 재설정 또는 외부 인증 전환이 필요합니다."}
          </small>
          {(backupValidation.errors.length > 0 || backupValidation.warnings.length > 0) && (
            <em>
              {[...backupValidation.errors, ...backupValidation.warnings].slice(0, 4).join(" · ")}
            </em>
          )}
        </div>
      )}
      {backupValidation && (
        <label className="storage-secure-confirmation restore">
          <span>보안 백업 복구 확인 문구</span>
          <input
            value={restoreBackupConfirmation}
            placeholder={RESTORE_BACKUP_CONFIRMATION}
            disabled={!restoreReady || Boolean(storageBusy)}
            data-smoke="storage-restore-confirmation"
            onChange={(event) => onRestoreBackupConfirmationChange(event.target.value)}
          />
          <small>복구는 현재 admin 계정이 백업 안에도 admin으로 존재하고, 로그인 secret이 포함된 백업일 때만 실행됩니다.</small>
          <button
            type="button"
            disabled={!restoreReady || Boolean(storageBusy) || restoreBackupConfirmation.trim() !== RESTORE_BACKUP_CONFIRMATION}
            onClick={onRestoreBackup}
            data-smoke="storage-restore-backup"
          >
            <RotateCcw size={16} aria-hidden />
            {storageBusy === "restore" ? "백업 복구 중" : "보안 백업 복구 실행"}
          </button>
        </label>
      )}
      {storageMessage && <p className="quiet-text" data-smoke="storage-message">{storageMessage}</p>}
      {storageError && <p className="form-error" data-smoke="storage-error">{storageError}</p>}
    </section>
  );
}

function StorageSummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="storage-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function StorageTableRow({ table }: { table: StorageTableCheck }) {
  const matched = table.ok && table.count !== null && table.expectedCount !== undefined && table.count === table.expectedCount;
  const mismatched = table.ok && table.count !== null && table.expectedCount !== undefined && table.count !== table.expectedCount;
  const tone = table.ok ? (mismatched ? "caution" : "good") : "warning";
  return (
    <div className={`storage-table-row ${tone}`}>
      <div>
        <strong>{table.table}</strong>
        <span>{table.error ?? (matched ? "예상 row 수와 일치" : mismatched ? "현재 앱 상태와 row 수가 다름" : "연결 확인")}</span>
      </div>
      <b>
        {table.count === null ? "-" : table.count.toLocaleString()}
        {table.expectedCount !== undefined ? ` / ${table.expectedCount.toLocaleString()}` : ""}
      </b>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function serviceNoticeExpiresAtFromDuration(duration: ServiceNoticeDuration) {
  const hours = serviceNoticeDurationHours[duration];
  if (!hours) return null;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function formatServiceNoticeExpiry(notice?: Pick<ServiceNotice, "expiresAt"> | null) {
  if (!notice?.expiresAt) return "수동 해제";
  return `${formatDateTime(notice.expiresAt)} 자동 해제`;
}

function WalletView({
  state,
  currentUser,
  onPurchase,
}: {
  state: AppState;
  currentUser: User;
  onPurchase: (itemId: string) => Promise<ActionResult>;
}) {
  const ledger = state.ledger.filter((item) => item.userId === currentUser.id).slice().reverse();
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [purchasingItemId, setPurchasingItemId] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const ledgerStats = useMemo(() => {
    const entries = state.ledger.filter((item) => item.userId === currentUser.id);
    const income = entries.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    const spending = entries.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
    const debateReward = entries
      .filter((item) => item.type === "debate_reward" || item.type === "debate_win")
      .reduce((sum, item) => sum + Math.max(0, item.amount), 0);
    const shopSpent = entries
      .filter((item) => item.type === "shop_purchase")
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
    return { income, spending, debateReward, shopSpent, count: entries.length };
  }, [currentUser.id, state.ledger]);
  const normalizedLedgerSearch = ledgerSearch.trim().toLowerCase();
  const filteredLedger = ledger.filter((item) => {
    const matchesType =
      ledgerFilter === "income"
        ? item.amount > 0
        : ledgerFilter === "spending"
          ? item.amount < 0
          : ledgerFilter === "debate"
            ? item.type.startsWith("debate_")
            : ledgerFilter === "shop"
              ? item.type.startsWith("shop_")
              : ledgerFilter === "admin"
                ? item.type === "admin_grant"
                : true;
    if (!matchesType) return false;
    if (!normalizedLedgerSearch) return true;
    return `${item.memo} ${item.type} ${item.createdAt}`.toLowerCase().includes(normalizedLedgerSearch);
  });
  const filterOptions: Array<{ value: LedgerFilter; label: string }> = [
    { value: "all", label: "전체" },
    { value: "income", label: "수입" },
    { value: "spending", label: "지출" },
    { value: "debate", label: "토론" },
    { value: "shop", label: "상점" },
    { value: "admin", label: "운영" },
  ];

  const purchase = async (item: ShopItem) => {
    setPurchasingItemId(item.id);
    setWalletMessage("");
    const result = await onPurchase(item.id);
    setPurchasingItemId("");
    setWalletMessage(result.ok ? `${item.name} 구매가 완료되었습니다.` : (result.message ?? "구매에 실패했습니다."));
  };

  return (
    <main className="single-view" data-smoke="wallet-view" data-wallet-user-id={currentUser.id}>
      <section className="wallet-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">기본 재화</p>
            <h2>{currentUser.coins.toLocaleString()} 코인</h2>
            <p>코인은 토론 보상과 프로필 꾸미기 상점에 사용하는 서비스 내부 재화입니다.</p>
          </div>
          <div className="wallet-icon">
            <Coins size={34} aria-hidden />
          </div>
        </div>
        <div className="shop-strip">
          <div>
            <strong>프로필 상점</strong>
            <span>실물 상품이 아닌 서비스 내부 꾸미기 아이템만 구매할 수 있습니다.</span>
          </div>
          <button type="button">
            <Store size={17} aria-hidden />
            {currentUser.ownedItemIds.length}개 보유
          </button>
        </div>
        <div className="wallet-summary-grid">
          <div className="wallet-summary-card balance" data-smoke="wallet-balance" data-current-coins={currentUser.coins}>
            <span>현재 잔액</span>
            <strong>{currentUser.coins.toLocaleString()}</strong>
            <small>사용 가능 코인</small>
          </div>
          <div className="wallet-summary-card income">
            <span>누적 수입</span>
            <strong>+{ledgerStats.income.toLocaleString()}</strong>
            <small>{ledgerStats.count}건 기록</small>
          </div>
          <div className="wallet-summary-card spending">
            <span>누적 지출</span>
            <strong>-{ledgerStats.spending.toLocaleString()}</strong>
            <small>상점 구매 포함</small>
          </div>
          <div className="wallet-summary-card reward" data-smoke="wallet-debate-reward" data-debate-reward={ledgerStats.debateReward}>
            <span>토론 보상</span>
            <strong>+{ledgerStats.debateReward.toLocaleString()}</strong>
            <small>승리 보상 합계</small>
          </div>
        </div>
        <RankingPanel users={state.users} />
        <div className="shop-grid">
          {shopItems.map((item) => {
            const owned = currentUser.ownedItemIds.includes(item.id);
            const disabled = owned || currentUser.coins < item.price || Boolean(purchasingItemId);
            return (
              <article className={`shop-card accent-${item.accent}`} key={item.id}>
                <div className="shop-icon">
                  {item.category === "badge" ? <Sparkles size={18} /> : item.category === "profile" ? <Palette size={18} /> : <Store size={18} />}
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                </div>
                <div className="shop-buy-row">
                  <span>{item.price.toLocaleString()} 코인</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      void purchase(item);
                    }}
                  >
                    {purchasingItemId === item.id ? "구매 중" : owned ? "보유중" : currentUser.coins < item.price ? "부족" : "구매"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {walletMessage && <p className="quiet-text">{walletMessage}</p>}
        <section className="wallet-ledger-panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">코인 원장</p>
              <h3>거래 내역</h3>
            </div>
            <span>{filteredLedger.length}건</span>
          </div>
          <div className="filter-tabs wallet-filters" aria-label="코인 원장 필터">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={ledgerFilter === option.value ? "active" : ""}
                onClick={() => setLedgerFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="channel-search">
            메모 검색
            <input
              value={ledgerSearch}
              onChange={(event) => setLedgerSearch(event.target.value)}
              placeholder="사유, 채널 ID, 상점 구매"
              data-smoke="ledger-search"
            />
          </label>
          <div className="ledger-list detailed" data-smoke="ledger-list">
            {filteredLedger.length === 0 && (
              <EmptyState title="표시할 거래가 없습니다." body="다른 필터를 선택해보세요." />
            )}
            {filteredLedger.map((item) => (
              <LedgerRow key={item.id} item={item} channels={state.channels} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function LedgerRow({ item, channels }: { item: CoinLedger; channels: DebateChannel[] }) {
  const meta = getLedgerMeta(item);
  const channelId = extractLedgerChannelId(item.memo);
  const channel = channelId ? channels.find((entry) => entry.id === channelId) : undefined;

  return (
    <article
      className={`ledger-row detailed ${meta.tone}`}
      data-smoke="ledger-row"
      data-ledger-type={item.type}
      data-ledger-amount={item.amount}
    >
      <span className="ledger-icon" aria-hidden>
        {meta.icon}
      </span>
      <div>
        <strong>{item.memo}</strong>
        <span>
          {meta.label} · {item.createdAt}
        </span>
        <small>{channel ? `${channel.title} · 원장 ID: ${item.id}` : `원장 ID: ${item.id}`}</small>
      </div>
      <b className={item.amount >= 0 ? "positive" : "negative"}>
        {item.amount >= 0 ? "+" : ""}
        {item.amount.toLocaleString()}
      </b>
    </article>
  );
}

function getLedgerMeta(item: CoinLedger): { label: string; tone: string; icon: React.ReactNode } {
  if (item.type === "shop_purchase") {
    return { label: "상점 구매", tone: "spending", icon: <Store size={17} /> };
  }
  if (item.type === "debate_reward" || item.type === "debate_win") {
    return { label: "토론 보상", tone: "income", icon: <Trophy size={17} /> };
  }
  if (item.type === "debate_result" || item.type === "debate_loss") {
    return { label: "토론 판정", tone: "neutral", icon: <Gavel size={17} /> };
  }
  if (item.type === "admin_grant") {
    return {
      label: item.amount >= 0 ? "운영 지급" : "운영 차감",
      tone: item.amount >= 0 ? "income" : "spending",
      icon: <Coins size={17} />,
    };
  }
  if (item.type === "signup") {
    return { label: "지급", tone: "income", icon: <Coins size={17} /> };
  }
  return { label: "예약", tone: item.amount < 0 ? "spending" : "neutral", icon: <Wallet size={17} /> };
}

function extractLedgerChannelId(memo: string) {
  return memo.match(/\[([^\]]+)\]/)?.[1];
}

function RankingPanel({ users }: { users: User[] }) {
  const rankedUsers = [...users]
    .sort((a, b) => {
      const aScore = a.stats.wins * 100 + a.stats.aiRating + a.stats.voteTrust + a.coins * 0.02;
      const bScore = b.stats.wins * 100 + b.stats.aiRating + b.stats.voteTrust + b.coins * 0.02;
      return bScore - aScore;
    })
    .slice(0, 5);

  return (
    <section className="ranking-panel" data-smoke="ranking-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">랭킹</p>
          <h3>토론러 TOP 5</h3>
        </div>
      </div>
      <div className="ranking-list">
        {rankedUsers.map((user, index) => (
          <div
            className="ranking-row"
            key={user.id}
            data-smoke="ranking-row"
            data-user-id={user.id}
            data-user-wins={user.stats.wins}
            data-user-coins={user.coins}
          >
            <b>{index + 1}</b>
            <Avatar user={user} />
            <div>
              <strong>{user.displayName}</strong>
              <span>
                {user.stats.wins}승 · AI {user.stats.aiRating} · 신뢰 {user.stats.voteTrust}
              </span>
            </div>
            <em>{user.coins.toLocaleString()}코인</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function getRoomIcon(room: Room) {
  const text = `${room.title} ${room.topic}`.toLowerCase();
  if (text.includes("ai") || text.includes("인공지능") || text.includes("노동")) return <Brain size={18} aria-hidden />;
  if (text.includes("부동산") || text.includes("주거") || text.includes("집")) return <Home size={18} aria-hidden />;
  if (text.includes("교육") || text.includes("입시") || text.includes("학벌") || text.includes("대학")) {
    return <GraduationCap size={18} aria-hidden />;
  }
  if (text.includes("정치") || text.includes("법") || text.includes("규제")) return <Scale size={18} aria-hidden />;
  if (text.includes("경제") || text.includes("시장") || text.includes("코인")) return <Landmark size={18} aria-hidden />;
  return <Gavel size={18} aria-hidden />;
}

function getClaimIcon(claim: ProfileClaim) {
  const text = `${claim.label} ${claim.value}`.toLowerCase();
  if (text.includes("학") || text.includes("대학") || text.includes("school") || text.includes("univ")) {
    return <GraduationCap size={13} aria-hidden />;
  }
  if (text.includes("직") || text.includes("회사") || text.includes("pm") || text.includes("ceo") || text.includes("개발")) {
    return <Building2 size={13} aria-hidden />;
  }
  if (claim.status === "verified") return <CircleCheck size={13} aria-hidden />;
  return <BadgeCheck size={13} aria-hidden />;
}

function getPhaseBaseSeconds(phase: DebatePhase) {
  if (phase === "opening") return OPENING_SECONDS;
  if (phase === "closing") return CLOSING_SECONDS;
  return CROSSFIRE_SECONDS;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
  smokeId,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  smokeId?: string;
}) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick} data-smoke={smokeId}>
      {icon}
      {label}
    </button>
  );
}

function Avatar({
  user,
  large = false,
}: {
  user: Pick<User, "displayName" | "photoUrl"> & Partial<Pick<User, "accentColor" | "profileFrame">>;
  large?: boolean;
}) {
  const displayName = user.displayName || "참가자";
  const initials = displayName.slice(0, 2).toUpperCase();
  const classes = `avatar ${large ? "large" : ""} accent-${user.accentColor ?? "blue"} frame-${user.profileFrame ?? "clean"}`;
  return user.photoUrl ? (
    <img className={classes} src={user.photoUrl} alt={`${displayName} 프로필`} />
  ) : (
    <div className={classes}>{initials}</div>
  );
}

function ProfileLine({ snapshot }: { snapshot: ParticipantSnapshot }) {
  const safeSnapshot = normalizeSnapshot(snapshot);
  const primaryClaim = safeSnapshot.claims.find((claim) => claim.status === "verified") ?? safeSnapshot.claims[0];
  return (
    <div className="participant-line">
      <Avatar user={safeSnapshot} />
      <div>
        <strong>{safeSnapshot.displayName}</strong>
        <span>{safeSnapshot.title}</span>
        {primaryClaim && (
          <em>
            {getClaimIcon(primaryClaim)}
            {primaryClaim.value} · {verificationLabels[primaryClaim.status]}
          </em>
        )}
        <small>{safeSnapshot.featuredBadge}</small>
      </div>
    </div>
  );
}

function ParticipantProfile({ snapshot }: { snapshot: ParticipantSnapshot }) {
  const safeSnapshot = normalizeSnapshot(snapshot);
  return (
    <div className={`participant-profile accent-${safeSnapshot.accentColor} frame-${safeSnapshot.profileFrame} banner-${safeSnapshot.bannerStyle}`}>
      <Avatar user={safeSnapshot} large />
      <strong>{safeSnapshot.displayName}</strong>
      <span>{safeSnapshot.title}</span>
      <div className="featured-badge">
        <Sparkles size={13} aria-hidden />
        {safeSnapshot.featuredBadge}
      </div>
      <p>{safeSnapshot.bio}</p>
      <div className="mini-stats">
        <b>{safeSnapshot.stats.wins}승</b>
        <b>{safeSnapshot.stats.losses}패</b>
        <b>AI {safeSnapshot.stats.aiRating}</b>
      </div>
      <TrustMeter subject={safeSnapshot} compact />
      <div className="claim-chips">
        {safeSnapshot.claims.slice(0, 3).map((claim) => (
          <span key={claim.id} className={claim.status}>
            {getClaimIcon(claim)}
            {claim.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ChannelStatus }) {
  return <span className={`status-pill ${status}`}>{statusLabels[status]}</span>;
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`role-badge ${role}`}>
      <ShieldCheck size={15} aria-hidden />
      {roleLabels[role]}
    </span>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={`verification-badge ${status}`}>
      {status === "verified" && <BadgeCheck size={14} aria-hidden />}
      {verificationLabels[status]}
    </span>
  );
}

function TrustMeter({
  subject,
  compact = false,
}: {
  subject: { claims: ProfileClaim[]; stats: UserStats; phoneVerified?: boolean };
  compact?: boolean;
}) {
  const trust = getTrustProfile(subject);
  return (
    <div className={`trust-meter ${compact ? "compact" : ""}`}>
      <div className="trust-meter-head">
        <span>
          <ShieldCheck size={14} aria-hidden />
          신뢰도
        </span>
        <strong>{trust.score}</strong>
      </div>
      <div className="trust-track" aria-hidden>
        <i style={{ "--trust-value": `${trust.score}%` } as CSSProperties} />
      </div>
      <div className="trust-signals">
        <span>{trust.verifiedCount}개 인증</span>
        <span>{trust.totalDebates}전</span>
        <span>{trust.winRate}% 승률</span>
      </div>
    </div>
  );
}

function getTrustProfile(subject: { claims: ProfileClaim[]; stats: UserStats; phoneVerified?: boolean }) {
  const verifiedCount = subject.claims.filter((claim) => claim.status === "verified").length;
  const pendingCount = subject.claims.filter((claim) => claim.status === "pending").length;
  const totalDebates = subject.stats.wins + subject.stats.losses;
  const winRate = totalDebates ? Math.round((subject.stats.wins / totalDebates) * 100) : 0;
  const score = Math.max(
    35,
    Math.min(
      99,
      Math.round(
        28 +
          Math.min(24, verifiedCount * 12) +
          Math.min(8, pendingCount * 2) +
          Math.min(14, totalDebates * 1.4) +
          subject.stats.aiRating * 0.18 +
          subject.stats.voteTrust * 0.18 +
          winRate * 0.08 +
          (subject.phoneVerified ? 7 : 0),
      ),
    ),
  );
  return { score, verifiedCount, pendingCount, totalDebates, winRate };
}

function DebateResultSummary({
  channel,
  users,
  currentUser,
  aiAppeals,
  onSubmitAiAppeal,
}: {
  channel: DebateChannel;
  users: User[];
  currentUser: User;
  aiAppeals: AiAppealRecord[];
  onSubmitAiAppeal: (reason: string) => Promise<ActionResult>;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealError, setAppealError] = useState("");
  const aiJudgement = channel.aiJudgement;
  const finalResult = channel.finalResult;
  if (!aiJudgement || !finalResult) return null;

  const totalVotes = channel.votes.length;
  const winnerId = finalResult.winnerId;
  const loserId = finalResult.loserId ?? channel.participantIds.find((participantId) => participantId !== winnerId) ?? winnerId;
  const transferredCoins =
    typeof finalResult.transferredCoins === "number" && Number.isFinite(finalResult.transferredCoins)
      ? finalResult.transferredCoins
      : 0;
  const resolvedAt = finalResult.resolvedAt ?? aiJudgement.decidedAt ?? channel.createdAt;
  const reasoning = aiJudgement.reasoning || "AI 판정 요약이 없습니다.";
  const userScores = aiJudgement.userScores ?? {};
  const finalScores = aiJudgement.finalScores ?? {};
  const categoryScores = aiJudgement.categoryScores ?? {};
  const currentAppeal = aiAppeals.find((appeal) => appeal.channelId === channel.id && appeal.userId === currentUser.id);
  const canAppeal = channel.participantIds.includes(currentUser.id) && !currentAppeal;
  const getSnapshot = (participantId: string): ParticipantSnapshot => {
    const user = users.find((item) => item.id === participantId);
    const snapshot = channel.participantSnapshots[participantId];
    return normalizeSnapshot(
      snapshot ?? {
        userId: participantId,
        displayName: user?.displayName ?? "참가자",
        title: user?.title ?? "",
        bio: user?.bio ?? "",
        photoUrl: user?.photoUrl ?? "",
        accentColor: user?.accentColor ?? defaultProfileStyle.accentColor,
        profileFrame: user?.profileFrame ?? defaultProfileStyle.profileFrame,
        bannerStyle: user?.bannerStyle ?? defaultProfileStyle.bannerStyle,
        featuredBadge: user?.featuredBadge ?? defaultProfileStyle.featuredBadge,
        claims: user?.claims ?? [],
        stats: user?.stats ?? { wins: 0, losses: 0, aiRating: 50, voteTrust: 50 },
      },
    );
  };
  const winner = getSnapshot(winnerId);
  const loser = getSnapshot(loserId);
  const categoryLabels: Array<[keyof AiCategoryScore, string]> = [
    ["logic", "논리"],
    ["evidence", "근거"],
    ["rebuttal", "반박"],
    ["relevance", "주제"],
    ["conduct", "태도"],
  ];
  const shareText = [
    "[노수베스트 토론 결과]",
    `토론: ${channel.title}`,
    `최종 승자: ${winner.displayName}`,
    `관전자 투표: ${totalVotes}표`,
    `발언 로그: ${channel.debateMessages.length}개`,
    `공감 반응: ${channel.reactions.length}개`,
    `승자 보상: ${transferredCoins.toLocaleString()}코인`,
    `판정 완료: ${resolvedAt}`,
    "",
    `AI 판정 요약: ${reasoning}`,
    "",
    ...channel.participantIds.map((participantId) => {
      const snapshot = getSnapshot(participantId);
      const voteCount = channel.votes.filter((voteItem) => voteItem.targetUserId === participantId).length;
      return `- ${snapshot.displayName}: 최종 ${finalScores[participantId] ?? 0}점, AI ${userScores[participantId] ?? 0}점, ${voteCount}표`;
    }),
  ].join("\n");

  const copyShareText = async () => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopyError("결과 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  };

  const submitAppeal = async (event: FormEvent) => {
    event.preventDefault();
    const reason = appealReason.trim();
    if (!reason) {
      setAppealError("이의제기 사유를 입력해주세요.");
      return;
    }
    setAppealBusy(true);
    setAppealMessage("");
    setAppealError("");
    const result = await onSubmitAiAppeal(reason);
    setAppealBusy(false);
    if (!result.ok) {
      setAppealError(result.message ?? "AI 판정 이의제기 제출에 실패했습니다.");
      return;
    }
    setAppealReason("");
    setAppealMessage("이의제기를 운영자에게 보냈습니다.");
  };

  return (
    <section
      className="result-summary"
      data-smoke="result-summary"
      data-winner-id={winnerId}
      data-final-vote-count={totalVotes}
    >
      <div className="result-hero">
        <div className="result-winner">
          <span className="result-kicker">
            <Trophy size={15} aria-hidden />
            최종 승자
          </span>
          <Avatar user={winner} large />
          <div>
            <h3>{winner.displayName}</h3>
            <p>{winner.title}</p>
          </div>
        </div>
        <div className="result-reward">
          <span>승자 보상</span>
          <strong>
            <Coins size={18} aria-hidden />
            {transferredCoins.toLocaleString()}코인
          </strong>
          <small>{loser.displayName} 코인 차감 없음</small>
        </div>
      </div>

      <div className="result-metrics">
        <span>
          <Vote size={16} aria-hidden />
          <b>{totalVotes}</b>
          관전자 투표
        </span>
        <span>
          <Brain size={16} aria-hidden />
          <b>60/40</b>
          투표 + AI
        </span>
        <span>
          <MessageSquare size={16} aria-hidden />
          <b>{channel.debateMessages.length}</b>
          발언 로그
        </span>
        <span>
          <ThumbsUp size={16} aria-hidden />
          <b>{channel.reactions.length}</b>
          공감 반응
        </span>
      </div>

      <div className="result-reasoning">
        <strong>AI 판정 요약</strong>
        <p>{reasoning}</p>
        <time>{resolvedAt} 판정 완료</time>
      </div>

      <div className="result-share-card">
        <div>
          <span className="result-kicker">
            <Sparkles size={15} aria-hidden />
            공유 카드
          </span>
          <strong>{channel.title}</strong>
          <p>
            {winner.displayName} 승리 · 관전자 {totalVotes}표 · 발언 {channel.debateMessages.length}개
          </p>
        </div>
        <button type="button" onClick={copyShareText} data-smoke="result-copy">
          <Copy size={16} aria-hidden />
          {copied ? "복사됨" : "결과 복사"}
        </button>
      </div>
      {copyError && <p className="form-error" data-smoke="result-copy-error">{copyError}</p>}

      <form className="result-share-card" onSubmit={submitAppeal} data-smoke="ai-appeal-form">
        <div>
          <span className="result-kicker">
            <Scale size={15} aria-hidden />
            판정 재검토
          </span>
          <strong>{currentAppeal ? aiAppealStatusLabels[currentAppeal.status] : "이의제기 제출"}</strong>
          {currentAppeal ? (
            <p>
              제출 사유: {currentAppeal.reason}
              {currentAppeal.reviewMemo ? ` · 처리 메모: ${currentAppeal.reviewMemo}` : ""}
            </p>
          ) : (
            <textarea
              value={appealReason}
              onChange={(event) => setAppealReason(event.target.value)}
              placeholder="판정 근거 중 재검토가 필요한 부분을 적어주세요."
              maxLength={500}
              rows={3}
              disabled={!canAppeal || appealBusy}
            />
          )}
        </div>
        {!currentAppeal && (
          <button type="submit" disabled={!canAppeal || appealBusy || !appealReason.trim()} data-smoke="ai-appeal-submit">
            <Scale size={16} aria-hidden />
            {appealBusy ? "제출 중" : "이의제기"}
          </button>
        )}
      </form>
      {appealMessage && <p className="form-success">{appealMessage}</p>}
      {appealError && <p className="form-error">{appealError}</p>}

      <div className="result-score-grid">
        {channel.participantIds.map((participantId) => {
          const snapshot = getSnapshot(participantId);
          const voteCount = channel.votes.filter((voteItem) => voteItem.targetUserId === participantId).length;
          const votePercent = totalVotes === 0 ? 0 : Math.round((voteCount / totalVotes) * 100);
          const aiScore = userScores[participantId] ?? 0;
          const finalScore = finalScores[participantId] ?? 0;
          const categories = categoryScores[participantId];
          return (
            <article
              className={`result-score-card ${participantId === winnerId ? "winner" : "runner"}`}
              key={participantId}
            >
              <div className="result-score-head">
                <Avatar user={snapshot} />
                <div>
                  <strong>{snapshot.displayName}</strong>
                  <span>{participantId === winnerId ? "승리" : "패배"}</span>
                </div>
                <b>{finalScore}</b>
              </div>
              <div className="result-score-bars">
                <div>
                  <span>관전자 {voteCount}표</span>
                  <b>{votePercent}%</b>
                  <i style={{ "--bar-value": `${votePercent}%` } as CSSProperties} />
                </div>
                <div>
                  <span>AI 점수</span>
                  <b>{aiScore}</b>
                  <i style={{ "--bar-value": `${aiScore}%` } as CSSProperties} />
                </div>
              </div>
              {categories && (
                <div className="result-category-list">
                  {categoryLabels.map(([key, label]) => (
                    <span key={key}>
                      {label}
                      <b>{categories[key]}</b>
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DebateReplaySummary({ channel, users }: { channel: DebateChannel; users: User[] }) {
  const replayPhases: Array<[DebatePhase, string]> = [
    ["opening", "기조"],
    ["crossfire", "크로스파이어"],
    ["closing", "최종"],
    ["voting", "투표"],
  ];
  const winner = channelParticipantSnapshot(channel, users, channel.finalResult?.winnerId ?? channel.aiJudgement?.winnerId);
  const topMessages = channel.debateMessages
    .slice()
    .sort((left, right) => right.body.length - left.body.length)
    .slice(0, 2);
  const totalAudienceEvents = channel.spectatorMessages.length + channel.reactions.length + channel.votes.length;

  return (
    <section className="replay-summary" data-smoke="replay-summary">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">리플레이 모드</p>
          <h3>토론 흐름 다시보기</h3>
        </div>
        <span>
          <Clock3 size={15} aria-hidden />
          {channel.finalResult?.resolvedAt ?? channel.aiJudgement?.decidedAt ?? channel.createdAt}
        </span>
      </div>

      <div className="replay-stat-grid">
        <span>
          <Trophy size={16} aria-hidden />
          <b>{winner?.displayName ?? "결과"}</b>
          최종 승자
        </span>
        <span>
          <MessageSquare size={16} aria-hidden />
          <b>{channel.debateMessages.length}</b>
          참가자 발언
        </span>
        <span>
          <Eye size={16} aria-hidden />
          <b>{totalAudienceEvents}</b>
          관전 이벤트
        </span>
      </div>

      <div className="replay-phase-track">
        {replayPhases.map(([phase, label]) => {
          const count = channel.debateMessages.filter((message) => (message.phase ?? "ready") === phase).length;
          return (
            <span key={phase}>
              <b>{label}</b>
              <em>{count}개 발언</em>
            </span>
          );
        })}
      </div>

      <div className="replay-highlights">
        <strong>하이라이트 발언</strong>
        {topMessages.length === 0 && <p>저장된 참가자 발언이 없습니다.</p>}
        {topMessages.map((message) => {
          const author = users.find((user) => user.id === message.authorId);
          return (
            <blockquote key={message.id}>
              <p>{message.body}</p>
              <footer>
                {author?.displayName ?? "참가자"} · {message.phase ? phaseLabels[message.phase] : "토론"} · {message.createdAt}
              </footer>
            </blockquote>
          );
        })}
      </div>
    </section>
  );
}

function VoteBars({ channel, users }: { channel: DebateChannel; users: User[] }) {
  const total = Math.max(1, channel.votes.length);
  return (
    <div className="vote-bars">
      {channel.participantIds.map((participantId) => {
        const user = users.find((item) => item.id === participantId);
        const count = channel.votes.filter((voteItem) => voteItem.targetUserId === participantId).length;
        const percent = Math.round((count / total) * 100);
        return (
          <div className="vote-bar-row" key={participantId}>
            <span>{user?.displayName ?? "참가자"}</span>
            <div className="vote-track">
              <i style={{ width: `${percent}%` }} />
            </div>
            <b>{count}표</b>
          </div>
        );
      })}
    </div>
  );
}

function AiResult({ channel, users }: { channel: DebateChannel; users: User[] }) {
  if (!channel.aiJudgement || !channel.finalResult) return null;
  const winner = users.find((user) => user.id === channel.finalResult?.winnerId);
  const loser = users.find((user) => user.id === channel.finalResult?.loserId);
  const transferredCoins = channel.finalResult.transferredCoins ?? 0;
  const userScores = channel.aiJudgement.userScores ?? {};
  const finalScores = channel.aiJudgement.finalScores ?? {};
  const categoryScores = channel.aiJudgement.categoryScores ?? {};

  return (
    <div className="ai-result">
      <div className="result-head">
        <Trophy size={18} aria-hidden />
        <strong>{winner?.displayName} 승리</strong>
        <span>{transferredCoins}코인 보상</span>
      </div>
      <p>{channel.aiJudgement.reasoning || "AI 판정 요약이 없습니다."}</p>
      <div className="score-table">
        {channel.participantIds.map((participantId) => {
          const user = users.find((item) => item.id === participantId);
          const categories = categoryScores[participantId];
          return (
            <div key={participantId}>
              <span>{user?.displayName}</span>
              <b>AI {userScores[participantId] ?? 0}</b>
              <b>최종 {finalScores[participantId] ?? 0}</b>
              {categories && (
                <small>
                  논리 {categories.logic} · 근거 {categories.evidence} · 반박 {categories.rebuttal} · 태도 {categories.conduct}
                </small>
              )}
            </div>
          );
        })}
      </div>
      {loser && <small>{loser.displayName}의 코인은 차감하지 않고 전적만 반영했습니다.</small>}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function scoreDebateCategories(messages: DebateMessage[]): AiCategoryScore {
  const text = messages.map((message) => message.body).join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const evidenceHits = (text.match(/근거|자료|통계|사례|연구|수치|비용|효과|전환/g) ?? []).length;
  const rebuttalHits = (text.match(/반박|하지만|그러나|따라서|동의|질문|핵심|논리/g) ?? []).length;
  const relevanceHits = (text.match(/주제|쟁점|정의|원인|결과|대안|정책|시장|교육|AI|규제/g) ?? []).length;
  const toxicHits = (text.match(/멍청|바보|꺼져|한심|무식|쓰레기/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const logic = Math.max(35, Math.min(98, Math.round(48 + words * 0.16 + rebuttalHits * 4 + questions * 2)));
  const evidence = Math.max(35, Math.min(98, Math.round(45 + evidenceHits * 8 + words * 0.08)));
  const rebuttal = Math.max(35, Math.min(98, Math.round(44 + rebuttalHits * 7 + questions * 3)));
  const relevance = Math.max(35, Math.min(98, Math.round(50 + relevanceHits * 4 + Math.min(words, 220) * 0.07)));
  const conduct = Math.max(20, Math.min(98, Math.round(88 - toxicHits * 18)));
  const total = Math.round(logic * 0.28 + evidence * 0.24 + rebuttal * 0.22 + relevance * 0.18 + conduct * 0.08);
  return { logic, evidence, rebuttal, relevance, conduct, total };
}

function scoreDebateMessages(messages: DebateMessage[]) {
  return scoreDebateCategories(messages).total;
}

function buildReasoning(
  channel: DebateChannel,
  winnerId: string,
  userScores: Record<string, number>,
  voteScores: Record<string, number>,
) {
  const winner = channel.participantSnapshots[winnerId];
  const otherIds = channel.participantIds.filter((participantId) => participantId !== winnerId);
  const runnerUp = otherIds[0] ? channel.participantSnapshots[otherIds[0]] : null;
  const aiGap = runnerUp ? (userScores[winnerId] ?? 0) - (userScores[runnerUp.userId] ?? 0) : 0;
  const voteGap = runnerUp ? (voteScores[winnerId] ?? 0) - (voteScores[runnerUp.userId] ?? 0) : 0;
  return `${winner?.displayName ?? "승자"}는 근거 제시, 반박 대응, 주제 유지 점수에서 우위를 보였습니다. AI 점수 차이는 ${aiGap}점, 관전자 표 차이는 ${voteGap}표였고 관전자 투표 60%와 AI 분석 40%를 합산해 최종 승자로 결정했습니다.`;
}
