export type ExpertRole = 'CREATIVE_DIRECTOR' | 'ART_DIRECTOR' | 'BRAND_DIRECTOR' | 'LIGHTING_DIRECTOR' | 'COMPOSITION_DIRECTOR' | 'FASHION_DIRECTOR' | 'MARKETING_DIRECTOR' | 'COST_DIRECTOR' | 'AI_DIRECTOR' | 'QUALITY_DIRECTOR';
export type OperationMode = 'LOCAL' | 'LIGHT' | 'COLOR' | 'AI' | 'FINAL';
export type PrincipleDomain = 'LUXURY' | 'FASHION' | 'PORTRAIT' | 'CINEMA' | 'CATALOG' | 'FOOD' | 'ARCHITECTURE' | 'CARS' | 'JEWELRY' | 'BEAUTY';
export type VisualLawName = 'LEADING_LINES' | 'GOLDEN_RATIO' | 'RULE_OF_THIRDS' | 'COLOR_HARMONY' | 'CONTRAST' | 'DEPTH' | 'NEGATIVE_SPACE' | 'FOCUS' | 'PERSPECTIVE' | 'HIERARCHY' | 'BALANCE';
export type TasteDimension = 'LUXURY' | 'MINIMAL' | 'DARK' | 'BRIGHT' | 'FASHION' | 'EDITORIAL' | 'COMMERCIAL' | 'INSTAGRAM' | 'PINTEREST' | 'CINEMA' | 'ART' | 'PREMIUM';
export type CreativeMetricName = 'beauty' | 'luxury' | 'brand' | 'composition' | 'lighting' | 'color' | 'emotion' | 'commercial' | 'consistency' | 'innovation' | 'aiEfficiency';
export type CreativeIQDimension = 'reasoning' | 'planning' | 'composition' | 'style' | 'brand' | 'economy' | 'learning' | 'creative';

export interface StudioPrompt { readonly text: string; readonly projectId: string; readonly intent?: string; readonly goals?: readonly string[]; readonly domain?: PrincipleDomain; readonly budget?: number; readonly speedPriority?: number; readonly preserveIdentity?: number; readonly metadata?: Readonly<Record<string, unknown>> }
export interface ExpertOpinion { readonly id: string; readonly role: ExpertRole; readonly recommendation: string; readonly confidence: number; readonly reason: string; readonly operations: readonly OperationMode[]; readonly risks: readonly string[]; readonly expectedQuality: number; readonly expectedCost: number }
export interface DebateStatement { readonly id: string; readonly expert: ExpertRole; readonly kind: 'SUPPORT' | 'OBJECTION' | 'ALTERNATIVE'; readonly targetOpinionId: string; readonly statement: string; readonly weight: number }
export interface Debate { readonly opinions: readonly ExpertOpinion[]; readonly statements: readonly DebateStatement[]; readonly conflicts: readonly { readonly topic: string; readonly experts: readonly ExpertRole[] }[] }
export interface Consensus { readonly summary: string; readonly acceptedIdeas: readonly string[]; readonly rejectedIdeas: readonly string[]; readonly minorityOpinion: readonly string[]; readonly operations: readonly OperationMode[]; readonly confidence: number }
export interface CreativePrinciple { readonly id: string; readonly domain: PrincipleDomain; readonly statement: string; readonly priority: number; readonly weight: number; readonly confidence: number; readonly support: number }
export interface VisualLawAssessment { readonly law: VisualLawName; readonly score: number; readonly confidence: number; readonly recommendation: string }
export interface TradeoffQuestion { readonly left: 'QUALITY' | 'REALISM' | 'BRAND' | 'SPEED'; readonly right: 'SPEED' | 'COST' | 'CREATIVITY' | 'EMOTION' | 'FACE_PRESERVATION'; readonly leftWeight?: number; readonly rightWeight?: number }
export interface TradeoffResult extends TradeoffQuestion { readonly winner: 'LEFT' | 'RIGHT' | 'BALANCED'; readonly rationale: string; readonly confidence: number }
export interface StyleVector { readonly dimensions: 128 | 256; readonly values: readonly number[]; readonly coordinates: Readonly<Record<TasteDimension, number>>; readonly version: string }
export interface CreativeIdentity { readonly creative: StyleVector; readonly visual: Readonly<Record<string, number>>; readonly editing: Readonly<Record<OperationMode, number>>; readonly ai: Readonly<{ reliance: number; experimentation: number; preservation: number }> }
export interface StrategyVersion { readonly id: string; readonly name: string; readonly version: number; readonly parentId?: string; readonly score: number; readonly confidence: number; readonly operations: readonly OperationMode[]; readonly createdAt: number }
export interface StudioKnowledge { readonly id: string; readonly domain: PrincipleDomain; readonly conditions: readonly string[]; readonly outcome: string; readonly support: number; readonly confidence: number; readonly satisfaction: number; readonly updatedAt: number }
export type CreativeMetrics = Readonly<Record<CreativeMetricName, number>>;
export type CreativeIQProfile = Readonly<Record<CreativeIQDimension, number>>;
export interface TimelineEvent { readonly id: string; readonly at: number; readonly type: string; readonly summary: string; readonly version: number }
export interface StudioTrace { readonly id: string; readonly at: number; readonly prompt: StudioPrompt; readonly intent: string; readonly goals: readonly string[]; readonly experts: readonly ExpertOpinion[]; readonly debate: Debate; readonly consensus: Consensus; readonly tradeoffs: readonly TradeoffResult[]; readonly knowledge: readonly StudioKnowledge[]; readonly identity: CreativeIdentity; readonly reasoning: readonly string[]; readonly decision: string; readonly expectedResult: CreativeMetrics; readonly creativeIQ: CreativeIQProfile; readonly visualLaws: readonly VisualLawAssessment[]; readonly strategy: StrategyVersion }
export interface StudioDependencies { readonly nextId: () => string; readonly now: () => number }

export interface ReasoningModel { reason(prompt: StudioPrompt, role: ExpertRole): ExpertOpinion }
export interface DirectorModel { direct(prompt: StudioPrompt, opinions: readonly ExpertOpinion[]): readonly DebateStatement[] }
export interface ConsensusModel { resolve(prompt: StudioPrompt, debate: Debate): Consensus }
export interface TasteModel { encode(prompt: StudioPrompt, dimensions?: 128 | 256): StyleVector }
export interface WorldModel { assess(prompt: StudioPrompt): readonly VisualLawAssessment[] }
export interface TradeoffModel { solve(prompt: StudioPrompt, question: TradeoffQuestion): TradeoffResult }
export interface LearningModel { learn(trace: StudioTrace): StudioKnowledge }
