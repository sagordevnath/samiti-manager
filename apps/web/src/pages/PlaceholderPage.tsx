import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Generic under-construction page for module routes that are scaffolded. */
export function PlaceholderPage() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('common.comingSoon')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t('common.underConstruction')}</p>
      </CardContent>
    </Card>
  );
}
