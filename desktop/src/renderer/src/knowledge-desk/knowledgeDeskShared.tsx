import type { ElementType, ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import type { KnowledgeItem } from './knowledgeDeskApi';
import { activeFilterCount, type ItemFilters, typeCopy } from './knowledgeDeskViewModel';
import { formatCount, sourceIcon } from './knowledgeDeskDisplay';

const statusCopy: Record<NonNullable<KnowledgeItem['status']>, string> = {
  pending: '待整理',
  processing: '整理中',
  done: '已整理',
  failed: '需重试',
  archived: '已归档',
};

export const Panel = ({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) => (
  <section className="kd-panel">
    <header>
      <Icon size={17} />
      <h2>{title}</h2>
    </header>
    {children}
  </section>
);

export const ContextBlock = ({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: ElementType;
  children: ReactNode;
}) => (
  <section className="kd-context-block">
    <h2>
      {Icon ? <Icon size={15} /> : null}
      {title}
    </h2>
    {children}
  </section>
);

export const MetricCard = ({ label, value, detail }: { label: string; value: string; detail: string }) => (
  <article className="kd-metric">
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
);

export const TimelineItem = ({ item }: { item: KnowledgeItem }) => (
  <>
    <span>{item.time}</span>
    <strong>{item.title}</strong>
  </>
);

export const EmptyBlock = ({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: { label: string; onClick: () => void };
  description: string;
  icon: ElementType;
  title: string;
}) => (
  <div className="kd-empty-state">
    <Icon size={18} />
    <strong>{title}</strong>
    <span>{description}</span>
    {action ? (
      <button className="kd-action-button kd-action-button--primary" onClick={action.onClick} type="button">
        {action.label}
      </button>
    ) : null}
  </div>
);

export const ItemList = ({
  emptyText,
  items,
  onOpenDetail,
}: {
  emptyText?: string;
  items: KnowledgeItem[];
  onOpenDetail?: (item: KnowledgeItem) => void;
}) => (
  <div className="kd-item-list">
    {items.map((item) => (
      <button className="kd-compact-item" key={item.id} onClick={() => onOpenDetail?.(item)} type="button">
        <span className="kd-source-icon">{sourceIcon(item.type)}</span>
        <span>
          <strong>{item.title}</strong>
          <small>{item.summary}</small>
        </span>
      </button>
    ))}
    {items.length === 0 && emptyText ? <span className="kd-empty-inline">{emptyText}</span> : null}
  </div>
);

export const StatusPill = ({ status }: { status: NonNullable<KnowledgeItem['status']> }) => (
  <span className={`kd-status kd-status--${status}`}>{statusCopy[status]}</span>
);

export const MetaLine = ({ item }: { item: KnowledgeItem }) => (
  <div className="kd-meta-line">
    <span>{typeCopy[item.type]}</span>
    <span>{item.source}</span>
    <span>{item.time}</span>
    {item.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
  </div>
);

export const FilterGroup = ({
  activeValues,
  onToggle,
  selectionMode = 'multiple',
  title,
  values,
}: {
  activeValues: string[];
  onToggle: (value: string) => void;
  selectionMode?: 'multiple' | 'single';
  title: string;
  values: string[];
}) => (
  <section className="kd-filter-group">
    <h3>{title}</h3>
    {values.map((value) => (
      <label key={value}>
        <input
          checked={activeValues.includes(value)}
          name={selectionMode === 'single' ? `filter-${title}` : undefined}
          onChange={() => onToggle(value)}
          type={selectionMode === 'single' ? 'radio' : 'checkbox'}
        />
        {value}
      </label>
    ))}
    {values.length === 0 ? <span className="kd-muted">暂无可筛选项</span> : null}
  </section>
);

export const FilterSummary = ({
  filters,
  onClear,
  resultCount,
  totalCount,
}: {
  filters: ItemFilters;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) => {
  const activeCount = activeFilterCount(filters);
  return (
    <div className="kd-filter-summary">
      <FolderOpen size={18} />
      <strong>{activeCount > 0 ? `${activeCount} 个筛选条件` : '未启用筛选'}</strong>
      <span>{formatCount(resultCount)} / {formatCount(totalCount)} 条结果可见</span>
      <button disabled={activeCount === 0} onClick={onClear} type="button">清空筛选</button>
    </div>
  );
};

export const SettingsHeader = ({ title, description }: { title: string; description: string }) => (
  <header className="kd-settings-header">
    <h2>{title}</h2>
    <p>{description}</p>
  </header>
);

export const PreferenceRow = ({ label, value }: { label: string; value: string }) => (
  <div className="kd-preference-row">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export const ToggleRow = ({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) => (
  <label className="kd-toggle-row">
    <span>{label}</span>
    <input
      checked={checked}
      disabled={disabled}
      onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
      readOnly={!onChange}
      type="checkbox"
    />
  </label>
);
