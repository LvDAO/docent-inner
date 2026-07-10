import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, UploadIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { ProgressBar } from './ProgressBar';
import {
  usePreviewImportRunsFromFileMutation,
  useLazyImportRunsFromFileStreamQuery,
} from '@/app/api/collectionApi';
import { useLocale } from '../contexts/LocaleContext';

const uploadStates = {
  INACTIVE: 'inactive',
  PROCESSING: 'processing',
  REVIEWING: 'reviewing',
  UPLOADING: 'uploading',
} as const;

type UploadState = (typeof uploadStates)[keyof typeof uploadStates];

interface PreviewResult {
  status: string;
  would_import: {
    num_agent_runs: number;
    models: string[];
    task_ids: string[];
    score_types: string[];
  };
  file_info: {
    filename: string;
    task?: string;
    model?: string;
    total_samples: number;
  };
  sample_preview: Array<{
    metadata: Record<string, any>;
    num_messages: number;
  }>;
}

interface UploadRunsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  onImportSuccess?: () => void;
}

export default function UploadRunsDialog({
  isOpen,
  onClose,
  file,
  onImportSuccess,
}: UploadRunsDialogProps) {
  const { t } = useLocale();
  const [uploadState, setUploadState] = useState<UploadState>(
    uploadStates.INACTIVE
  );
  const [error, setError] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null
  );
  const [currentSampleIndex, setCurrentSampleIndex] = useState<number>(0);
  const params = useParams();
  const collection_id = params.collection_id as string;
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [triggerPreview] = usePreviewImportRunsFromFileMutation();
  const [triggerImportStream, importStreamState] =
    useLazyImportRunsFromFileStreamQuery();

  const processFile = useCallback(
    async (selectedFile: File) => {
      setUploadState(uploadStates.PROCESSING);
      setError('');
      setPreviewResult(null);

      // Validate file extension
      const validExtensions = ['.eval', '.json'];
      const fileExtension = selectedFile.name.toLowerCase();
      const hasValidExtension = validExtensions.some((ext) =>
        fileExtension.endsWith(ext)
      );

      if (!hasValidExtension) {
        setError(
          t('workspace.upload.invalidFileType', {
            extensions: validExtensions.join(', '),
          })
        );
        setUploadState(uploadStates.REVIEWING);
        return;
      }

      try {
        const response = await triggerPreview({
          collectionId: collection_id,
          file: selectedFile,
        }).unwrap();
        setUploadState(uploadStates.REVIEWING);
        setPreviewResult(response as any);
        setCurrentSampleIndex(0);
        setProgressCurrent(0);
        setProgressTotal(response?.would_import?.num_agent_runs ?? null);
      } catch (err: any) {
        setError(
          err?.data?.detail ||
            err?.message ||
            t('workspace.upload.previewFailed')
        );
        setUploadState(uploadStates.REVIEWING);
      }
    },
    [collection_id, t, triggerPreview]
  );

  // Process file when dialog opens with a file
  useEffect(() => {
    if (isOpen && file && uploadState === uploadStates.INACTIVE) {
      processFile(file);
    }
  }, [isOpen, file, uploadState, processFile]);

  const handleImport = async () => {
    if (!file) return;

    setError('');
    setUploadState(uploadStates.UPLOADING);

    try {
      if (progressTotal === null && previewResult) {
        setProgressTotal(previewResult.would_import.num_agent_runs);
        setProgressCurrent(0);
      }

      const promise = triggerImportStream({
        collectionId: collection_id,
        file,
      });
      abortRef.current = { abort: () => promise.unsubscribe?.() } as any;

      await promise.unwrap();
      // unwrap resolves only for immediate queryFn; we rely on SSE updates via updateCachedData below
    } catch (err: any) {
      setError(
        err?.data?.detail || err?.message || t('workspace.upload.importFailed')
      );
      setUploadState(uploadStates.REVIEWING);
    }
  };

  const handleClose = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setUploadState(uploadStates.INACTIVE);
    onClose();
  }, [onClose]);

  // Reflect streaming progress from RTK Query into local UI state
  useEffect(() => {
    const data = importStreamState.data as any;
    if (!data) return;

    setProgressCurrent(data.uploaded);
    setProgressTotal(data.total);

    if (data.phase === 'complete' && isOpen) {
      toast({
        title: t('workspace.upload.importedTitle'),
        description: t('workspace.upload.importedDescription', {
          count: data.uploaded,
        }),
      });
      if (onImportSuccess) {
        onImportSuccess();
      }
      handleClose();
    }
  }, [importStreamState.data, handleClose, isOpen, onImportSuccess, t]);

  const showTruncationTooltip =
    previewResult &&
    previewResult.would_import.num_agent_runs >
      previewResult.sample_preview.length &&
    currentSampleIndex === previewResult.sample_preview.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          {previewResult ? (
            <DialogTitle>
              {t('workspace.upload.titleWithFilename', {
                filename: previewResult.file_info.filename,
              })}
            </DialogTitle>
          ) : (
            <DialogTitle>{t('workspace.upload.importInspectLog')}</DialogTitle>
          )}
        </DialogHeader>

        {uploadState === uploadStates.PROCESSING && (
          <div
            className="flex flex-col items-center space-y-2 py-8"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {t('workspace.upload.processingFile')}
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600" role="alert">
            {t('workspace.upload.errorPrefix', { error })}
          </div>
        )}
        {previewResult && (
          <div className="space-y-4">
            <div className="space-y-4 border rounded-lg p-4">
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="font-bold">
                        {t('workspace.upload.agentRuns')}
                      </td>
                      <td>{previewResult.would_import.num_agent_runs}</td>
                    </tr>
                    <tr>
                      <td className="font-bold">
                        {t('workspace.upload.task')}
                      </td>
                      <td>
                        {previewResult.file_info.task ||
                          t('workspace.upload.unknown')}
                      </td>
                    </tr>
                    <tr>
                      <td className="font-bold">
                        {t('workspace.upload.model')}
                      </td>
                      <td>
                        {previewResult.file_info.model ||
                          t('workspace.upload.unknown')}
                      </td>
                    </tr>
                    {previewResult.would_import.score_types.length > 0 && (
                      <tr>
                        <td className="font-bold">
                          {t('workspace.upload.scoreTypes')}
                        </td>
                        <td>
                          {previewResult.would_import.score_types.join(', ')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {previewResult.sample_preview.length > 0 && (
              <div className="text-sm">
                <div className="flex items-center justify-between mb-2">
                  <strong>{t('workspace.upload.runMetadata')}</strong>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t('workspace.upload.previousRun')}
                      title={t('workspace.upload.previousRun')}
                      onClick={() =>
                        setCurrentSampleIndex(
                          Math.max(0, currentSampleIndex - 1)
                        )
                      }
                      disabled={currentSampleIndex === 0}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {t('workspace.upload.runPosition', {
                        current: currentSampleIndex + 1,
                        total: previewResult.would_import.num_agent_runs,
                      })}
                    </span>
                    <Tooltip open={showTruncationTooltip ?? false}>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t('workspace.upload.nextRun')}
                            title={t('workspace.upload.nextRun')}
                            onClick={() =>
                              setCurrentSampleIndex(
                                Math.min(
                                  previewResult.sample_preview.length - 1,
                                  currentSampleIndex + 1
                                )
                              )
                            }
                            disabled={
                              currentSampleIndex ===
                              previewResult.sample_preview.length - 1
                            }
                          >
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('workspace.upload.previewLimit', {
                          count: previewResult.sample_preview.length,
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {(() => {
                  const currentSample =
                    previewResult.sample_preview[currentSampleIndex];
                  if (!currentSample) return null;

                  return (
                    <div className="space-y-2">
                      <div className="bg-secondary p-3 rounded-md text-xs font-mono h-[500px] overflow-y-auto border">
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(currentSample.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {uploadState === uploadStates.UPLOADING && (
          <div
            role="progressbar"
            aria-label={t('workspace.upload.importProgress')}
            aria-valuemin={0}
            aria-valuemax={progressTotal ?? undefined}
            aria-valuenow={progressCurrent}
          >
            <ProgressBar current={progressCurrent} total={progressTotal} />
          </div>
        )}

        <DialogFooter>
          <div className="flex space-x-2">
            <Button
              onClick={handleImport}
              disabled={!!error || uploadState !== uploadStates.REVIEWING}
            >
              {uploadState === uploadStates.UPLOADING && (
                <Loader2
                  size={16}
                  className="animate-spin text-muted-foreground mr-2"
                />
              )}
              {uploadState !== uploadStates.UPLOADING && (
                <UploadIcon size={16} className="mr-2" />
              )}
              {previewResult
                ? t('workspace.upload.importRuns', {
                    count: previewResult.would_import.num_agent_runs,
                  })
                : t('workspace.upload.importRunsPending')}
            </Button>
            <Button variant="outline" onClick={handleClose}>
              {t('workspace.upload.cancel')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
