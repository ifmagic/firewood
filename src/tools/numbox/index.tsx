import { Tabs } from 'antd';
import { useTranslation } from 'react-i18next';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';
import CalculatorPanel from './CalculatorPanel';
import TimestampPanel from './TimestampPanel';
import styles from './Numbox.module.css';

type TabKey = 'calc' | 'ts';

export default function Numbox() {
  const { t } = useTranslation();
  const [tab, setTab] = usePersistentState<TabKey>('tool:numbox:tab', 'calc');

  return (
    <ToolLayout title={t('toolName.numbox', { defaultValue: 'Abacus' })}>
      <div className={styles.container}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          destroyOnHidden
          items={[
            {
              key: 'calc',
              label: t('numbox.tabCalc'),
              children: (
                <div key="calc" className={styles.tabPane}>
                  <CalculatorPanel />
                </div>
              ),
            },
            {
              key: 'ts',
              label: t('numbox.tabTimestamp'),
              children: (
                <div key="ts" className={styles.tabPane}>
                  <TimestampPanel />
                </div>
              ),
            },
          ]}
        />
      </div>
    </ToolLayout>
  );
}
