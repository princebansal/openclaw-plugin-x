export interface EngagementInput {
  postId: string;
  undo?: boolean | undefined;
  dryRun?: boolean | undefined;
}

export function buildEngagementPlan(kind: 'like' | 'repost' | 'bookmark', input: EngagementInput) {
  return {
    kind,
    postId: input.postId,
    undo: input.undo ?? false,
    liveReady: false,
  };
}
