'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiRestClient } from '@/app/services/apiService';
import { useLocale } from '@/app/contexts/LocaleContext';

interface ModelApiKey {
  id: string;
  provider: string;
  masked_api_key: string;
}

const PROVIDERS = [{ value: 'deepseek' }, { value: 'custom' }] as const;

export default function ModelProvidersPage() {
  const { t } = useLocale();
  const [modelApiKeys, setModelApiKeys] = useState<ModelApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchModelApiKeys = async () => {
    try {
      const response = await apiRestClient.get('/model-api-keys');
      setModelApiKeys(response.data);
    } catch (error) {
      console.error('Failed to fetch model API keys:', error);
      toast({
        title: t('common.error'),
        description: t('modelProviders.loadFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModelApiKeys();
  }, []);

  const getAvailableProviders = () => {
    const usedProviders = new Set(modelApiKeys.map((key) => key.provider));
    return PROVIDERS.filter((provider) => !usedProviders.has(provider.value));
  };

  const handleSaveApiKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;

    setIsSaving(true);
    try {
      await apiRestClient.put('/model-api-keys', {
        provider: selectedProvider,
        api_key: apiKey.trim(),
      });

      setApiKey('');
      setSelectedProvider('');
      setIsDialogOpen(false);
      await fetchModelApiKeys();
    } catch (error) {
      console.error('Failed to save model API key:', error);
      toast({
        title: t('common.error'),
        description: t('modelProviders.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApiKey = async (provider: string) => {
    try {
      await apiRestClient.delete(`/model-api-keys/${provider}`);
      await fetchModelApiKeys();
    } catch (error) {
      console.error('Failed to delete model API key:', error);
      toast({
        title: t('common.error'),
        description: t('modelProviders.deleteFailed'),
        variant: 'destructive',
      });
    }
  };

  const getProviderLabel = (provider: string) => {
    if (provider === 'custom') return t('modelProviders.customEndpoint');
    if (provider === 'deepseek') return 'DeepSeek';
    return provider;
  };

  const availableProviders = getAvailableProviders();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('modelProviders.title')}</h1>
          <p className="text-muted-foreground">
            {t('modelProviders.description')}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={availableProviders.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              {t('modelProviders.add')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('modelProviders.addTitle')}</DialogTitle>
              <DialogDescription>
                {t('modelProviders.addDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider">{t('modelProviders.provider')}</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={setSelectedProvider}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('modelProviders.selectProvider')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {getProviderLabel(provider.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="apiKey">{t('modelProviders.apiKey')}</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('modelProviders.apiKeyPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setSelectedProvider('');
                  setApiKey('');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSaveApiKey}
                disabled={isSaving || !selectedProvider || !apiKey.trim()}
              >
                {isSaving
                  ? t('modelProviders.saving')
                  : t('modelProviders.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {availableProviders.length === 0 && modelApiKeys.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent>
            <p className="text-sm text-blue-800">
              {t('modelProviders.allConfigured')}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div>{t('common.loading')}</div>
            </CardContent>
          </Card>
        ) : modelApiKeys.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                {t('modelProviders.empty')}
              </div>
            </CardContent>
          </Card>
        ) : (
          modelApiKeys.map((key) => (
            <Card key={key.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CardTitle className="text-lg">
                      {getProviderLabel(key.provider)}
                    </CardTitle>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteApiKey(key.provider)}
                      aria-label={t('modelProviders.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div>
                  <div className="font-mono text-sm bg-gray-50 p-2 rounded mt-1">
                    {key.masked_api_key}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
