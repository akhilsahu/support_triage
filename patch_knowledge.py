import re

f = "ui/src/yullo/screens/knowledge/AuraKnowledgeScreen.tsx"
with open(f, "r") as file:
    content = file.read()

# Add useSpaceEntities import
if "useSpaceEntities" not in content:
    content = content.replace(
        "import { yulloOnboardingApi } from '../../api/onboarding';",
        "import { yulloOnboardingApi } from '../../api/onboarding';\nimport { useSpaceEntities, useConfirmEntity } from '../../api/entityQueries';"
    )

# Add hooks inside component
hook_insertion = """
  // Entity State
  const { data: entities = [], isLoading: isLoadingEntities, refetch: refetchEntities } = useSpaceEntities(spaceId || '');
  const confirmEntityMutation = useConfirmEntity(spaceId || '');

  const handleConfirmEntity = async (entityId: string, revision: number) => {
    try {
      await confirmEntityMutation.mutateAsync({ entityId, expectedRevision: revision });
    } catch (err) {
      console.error('Failed to confirm entity', err);
    }
  };
"""

content = re.sub(
    r"(const \[identityData, setIdentityData\] = useState<any>\(null\);)",
    r"\1" + hook_insertion,
    content
)

# Replace the hardcoded Zone 2 with dynamic entities rendering
zone2_pattern = re.compile(r"\{/\* Content Sections \(Synthesized Structured Understanding\) \*/\}.*?\{/\* Review Sheet Modal \*/\}", re.DOTALL)

zone2_replacement = """{/* Content Sections (Synthesized Structured Understanding) */}
                <div className="space-y-8 font-[Instrument_Sans]">
                  {isLoadingEntities ? (
                    <div className="py-4 text-center text-[var(--text-secondary)] text-[14px]">Loading extracted entities...</div>
                  ) : entities.length === 0 ? (
                    <div className="py-4 text-center text-[var(--text-secondary)] text-[14px]">No structured entities extracted yet.</div>
                  ) : (
                    entities.map((entity) => {
                      const isConfirmed = entity.review_status === 'owner_confirmed' || entity.review_status === 'source_authoritative';
                      const title = entity.payload_json?.title || entity.payload_json?.name || entity.payload_json?.label || 'Untitled';
                      const description = entity.payload_json?.description || entity.payload_json?.summary || entity.payload_json?.bio || '';
                      
                      return (
                        <div key={entity.id} className="space-y-2.5 pb-6 border-b border-[var(--border)]">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi] capitalize">
                              {entity.entity_type.replace('_', ' ')}
                            </h3>
                            <span className={`w-2 h-2 rounded-full shrink-0 shadow-xs ${isConfirmed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          </div>
                          
                          <div className="bg-[var(--surface-soft)] p-3 rounded-lg border border-[var(--border)]">
                            <h4 className="font-semibold text-[15px] text-[var(--text-primary)] mb-1">{title}</h4>
                            {description && <p className="text-[14px] text-[var(--text-secondary)]">{description}</p>}
                          </div>

                          <div className="flex items-center justify-between text-[13px] pt-1">
                            <span className="text-[var(--text-secondary)]">
                              Status: <span className="font-mono text-[var(--text-primary)]">{entity.review_status}</span>
                            </span>

                            <button
                              onClick={() => !isConfirmed && handleConfirmEntity(entity.id, entity.revision)}
                              disabled={isConfirmed || confirmEntityMutation.isPending}
                              className={`inline-flex items-center gap-1 text-[13px] hover:opacity-80 transition-opacity font-semibold ${isConfirmed ? 'text-emerald-700 dark:text-emerald-400 cursor-default' : 'text-amber-700 dark:text-amber-400 cursor-pointer underline'}`}
                            >
                              {isConfirmed ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>Confirmed</span>
                                </>
                              ) : confirmEntityMutation.isPending ? (
                                <span>Confirming...</span>
                              ) : (
                                <span>Confirm details</span>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

      {/* Review Sheet Modal */}"""

content = zone2_pattern.sub(zone2_replacement, content)

with open(f, "w") as file:
    file.write(content)
