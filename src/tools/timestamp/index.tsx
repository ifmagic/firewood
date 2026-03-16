import { Input, Button, Space, Descriptions, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import ToolLayout from '../../components/ToolLayout';
import { usePersistentState } from '../../hooks/usePersistentState';

export default function Timestamp() {
  const [ts, setTs] = usePersistentState('tool:timestamp:ts', '');
  const [dateValue, setDateValue] = usePersistentState<string | null>('tool:timestamp:date', null);
  const [tsResult, setTsResult] = usePersistentState('tool:timestamp:ts-result', '');
  const [dateResult, setDateResult] = usePersistentState('tool:timestamp:date-result', '');
  const date: Dayjs | null = dateValue ? dayjs(dateValue) : null;

  const tsToDate = () => {
    const num = Number(ts);
    if (isNaN(num)) return;
    // 自动判断秒/毫秒
    const d = ts.length >= 13 ? dayjs(num) : dayjs.unix(num);
    setTsResult(d.format('YYYY-MM-DD HH:mm:ss'));
  };

  const dateToTs = () => {
    if (!date) return;
    setDateResult(String(date.unix()));
  };

  const now = () => {
    setTs(String(dayjs().unix()));
    setTsResult(dayjs().format('YYYY-MM-DD HH:mm:ss'));
  };

  return (
    <ToolLayout title="时间戳转换" description="Unix 时间戳与人类可读日期互转">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions title="时间戳 → 日期" bordered column={1}>
          <Descriptions.Item label="时间戳">
            <Space>
              <Input
                value={ts}
                onChange={(e) => setTs(e.target.value)}
                placeholder="输入 Unix 时间戳（秒或毫秒）"
                style={{ width: 260 }}
              />
              <Button type="primary" onClick={tsToDate}>转换</Button>
              <Button onClick={now}>当前时间</Button>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="结果">
            <Input value={tsResult} readOnly />
          </Descriptions.Item>
        </Descriptions>

        <Descriptions title="日期 → 时间戳" bordered column={1}>
          <Descriptions.Item label="选择日期">
            <Space>
              <DatePicker
                showTime
                value={date}
                onChange={(d) => setDateValue(d ? d.toISOString() : null)}
              />
              <Button type="primary" onClick={dateToTs}>转换</Button>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Unix 时间戳（秒）">
            <Input value={dateResult} readOnly />
          </Descriptions.Item>
        </Descriptions>
      </Space>
    </ToolLayout>
  );
}
