'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiRestClient } from '@/app/services/apiService';
import { useLocale } from '@/app/contexts/LocaleContext';

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  disabled_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
}

interface CreateApiKeyResponse {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
}

export default function ApiKeysPage() {
  const { locale, t } = useLocale();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] =
    useState<CreateApiKeyResponse | null>(null);

  const fetchApiKeys = async () => {
    try {
      const response = await apiRestClient.get('/api-keys');
      setApiKeys(response.data);
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      toast({
        title: t('common.error'),
        description: t('apiKeys.loadFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;

    setIsCreating(true);
    try {
      const response = await apiRestClient.post('/api-keys', {
        name: newKeyName.trim(),
      });
      const newKey: CreateApiKeyResponse = response.data;

      setNewlyCreatedKey(newKey);
      setNewKeyName('');
      setIsCreateDialogOpen(false);
      await fetchApiKeys();

      toast({
        title: t('apiKeys.createdToast'),
        description: t('apiKeys.createdToastDescription'),
      });
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast({
        title: t('common.error'),
        description: t('apiKeys.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDisableApiKey = async (keyId: string) => {
    try {
      await apiRestClient.delete(`/api-keys/${keyId}`);
      await fetchApiKeys();
      toast({
        title: t('apiKeys.disabledToast'),
        description: t('apiKeys.disabledToastDescription'),
      });
    } catch (error) {
      console.error('Failed to disable API key:', error);
      toast({
        title: t('common.error'),
        description: t('apiKeys.disableFailed'),
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('apiKeys.copied'),
        description: t('apiKeys.copiedDescription'),
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast({
        title: t('apiKeys.copyFailed'),
        description: t('apiKeys.copyFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{t('apiKeys.title')}</h1>
          <p className="text-muted-foreground">{t('apiKeys.description')}</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('apiKeys.create')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('apiKeys.createTitle')}</DialogTitle>
              <DialogDescription>
                {t('apiKeys.createDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="keyName">{t('apiKeys.name')}</Label>
                <Input
                  id="keyName"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('apiKeys.namePlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreateApiKey}
                disabled={isCreating || !newKeyName.trim()}
              >
                {isCreating ? t('apiKeys.creating') : t('apiKeys.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {newlyCreatedKey && (
        <Card className="border-green-border bg-green-bg">
          <CardHeader>
            <CardTitle className="text-green-text">
              {t('apiKeys.createdSuccess')}
            </CardTitle>
            <CardDescription className="text-green-text">
              {t('apiKeys.copyNow')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <span className="font-mono flex items-center justify-start pl-2 text-sm border border-primary rounded w-full h-7">
                {newlyCreatedKey.api_key}
              </span>
              <div className="flex flex-row gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setNewlyCreatedKey(null)}
                >
                  {t('apiKeys.copiedButton')}
                </Button>
                <Button
                  size="sm"
                  className="h-7 w-7 !p-0"
                  onClick={() => copyToClipboard(newlyCreatedKey.api_key)}
                  aria-label={t('apiKeys.copy')}
                >
                  <Copy size={11} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('apiKeys.yourKeys')}</CardTitle>
          <CardDescription>{t('apiKeys.securityDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>{t('common.loading')}</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('apiKeys.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.created')}</TableHead>
                  <TableHead>{t('apiKeys.lastUsed')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} className="h-12">
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? 'default' : 'secondary'}>
                        {key.is_active
                          ? t('apiKeys.active')
                          : t('apiKeys.disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(key.created_at)}</TableCell>
                    <TableCell>
                      {key.last_used_at
                        ? formatDate(key.last_used_at)
                        : t('common.never')}
                    </TableCell>
                    <TableCell>
                      {key.is_active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisableApiKey(key.id)}
                          aria-label={t('apiKeys.disable')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
