export interface ProgressCounter {
	completed: number;
	total?: number;
	outcomes?: Record<string, number>;
}
export interface ProgressSnapshot {
	type: 'progress';
	reason: 'update' | 'heartbeat';
	phase: string;
	completed?: number;
	total?: number;
	unit?: string;
	detail?: string;
	queued?: number;
	inFlight?: number;
	counters?: Record<string, ProgressCounter>;
	rate?: number;
	etaMs?: number;
	elapsedMs: number;
	lastCompletedAt: number;
	active: Array<{ id: number; label: string; startedAt: number }>;
}
export type OperationEvent =
	| ProgressSnapshot
	| { type: 'inventory'; counts: Record<string, number>; complete: boolean }
	| { type: 'message'; message: string }
	| { type: 'run'; runId: string; stateId: string }
	| {
			type: 'outcome';
			objectType: 'page' | 'resource' | 'comment';
			objectId: string;
			pageId?: string;
			status: string;
	  }
	| {
			type: 'diagnostic';
			code: string;
			severity: string;
			message: string;
			pageId?: string;
			retryable: boolean;
	  }
	| { type: 'final'; status: string; exitCode: number };
