"use client";

import { Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { KqlInput } from "@/components/ui/kql-input";
import type { QueryFile, QueryTable } from "@/lib/api/query-files";
import type { KqlTable } from "@/lib/query/kql";
import type { KqlSchema } from "@/lib/query/kql-complete";
import { dataOf, newCondition, newTransformColumn, uid } from "@/lib/query-flow/defaults";
import type { NodeIssue } from "@/lib/query-flow/diagnose";
import { BUCKETS, COND_OP_KEYS, FLAG_NAMES, FN_ARGS, METRIC_NEEDS_FIELD, TRANSFORM_KINDS, VALUE_TYPES } from "@/lib/query-flow/labels";
import { COND_OPS, METRIC_KINDS, OUTPUT_KINDS, TRANSFORM_FNS } from "@/lib/query-flow/types";
import type {
  PivotData, TransposeData, UnpivotData,
  AdvancedData, Condition, ConditionalClause, DistinctData, FilterData, FlowNode, FlowQuery, GroupData, JoinData, LimitData, MetricKind, OutputData, SelectData,
  SortData, TransformColumn, TransformData, TransformFn, TransformKind, ValueType,
} from "@/lib/query-flow/types";
import { ColumnInput, FieldLabel, IconButton, SelectInput, SmallButton, TextInput } from "./fields";
import { NODE_META } from "./node-meta";
import { SourceFields } from "./source-fields";

export interface InspectorProps {
  node: FlowNode;
  /** Columns / fields known at the input of this step (suggestions). */
  columns: string[];
  tables: KqlTable[];
  files: QueryFile[];
  queryTables?: QueryTable[];
  queries: FlowQuery[];
  currentQueryId: string;
  teamId: string | null;
  scriptSchema: KqlSchema;
  filterSchema: KqlSchema;
  issue: NodeIssue | null;
  /** Columns the last preview returned (for "use these columns"). */
  previewColumns: string[];
  onChange: (data: Record<string, unknown>) => void;
  onMeta: (patch: Partial<FlowNode>) => void;
  onDelete: () => void;
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex items-center gap-1">{children}</div>;
const Card = ({ children }: { children: React.ReactNode }) => <div className="space-y-1.5 rounded-md border border-border bg-background/60 p-2">{children}</div>;

function ConditionEditor({
  cond,
  columns,
  schema,
  onChange,
  onRemove,
}: {
  cond: Condition;
  columns: string[];
  schema: KqlSchema;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("query-flow");
  const set = (patch: Partial<Condition>) => onChange({ ...cond, ...patch });
  const needsValue = !["empty", "notempty", "flag", "window", "in", "not in", "between"].includes(cond.op);
  return (
    <Card>
      <Row>
        {cond.op !== "flag" ? <ColumnInput value={cond.field} onChange={(field) => set({ field })} columns={columns} placeholder={t("cond.field")} ariaLabel={t("cond.field")} /> : null}
        <SelectInput
          ariaLabel={t("cond.operator")}
          value={cond.op}
          onChange={(op) => set({ op: op as Condition["op"] })}
          options={COND_OPS.map((o) => ({ value: o, label: t(`cond.ops.${COND_OP_KEYS[o]}`) }))}
          className="w-auto min-w-[96px]"
        />
        {onRemove ? <IconButton label={t("cond.remove")} onClick={onRemove} danger><Trash2 className="h-3.5 w-3.5" /></IconButton> : null}
      </Row>
      {cond.op === "flag" ? (
        <SelectInput ariaLabel={t("cond.flag")} value={cond.value || FLAG_NAMES[0]} onChange={(value) => set({ value })} options={FLAG_NAMES.map((f) => ({ value: f, label: t(`cond.flags.${f}`) }))} />
      ) : null}
      {cond.op === "window" ? <TextInput value={cond.value} placeholder={t("cond.windowPlaceholder")} aria-label={t("cond.window")} onChange={(e) => set({ value: e.target.value })} /> : null}
      {cond.op === "between" ? (
        <Row>
          <TextInput value={cond.value} placeholder={t("cond.from")} aria-label={t("cond.from")} onChange={(e) => set({ value: e.target.value })} />
          <TextInput value={cond.value2} placeholder={t("cond.to")} aria-label={t("cond.to")} onChange={(e) => set({ value2: e.target.value })} />
        </Row>
      ) : null}
      {cond.op === "in" || cond.op === "not in" ? (
        cond.values.length > 0 ? (
          <Row>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground" title={cond.values.join(", ")}>{cond.values.join(", ")}</span>
            <SmallButton onClick={() => set({ value: cond.values.join(", "), values: [] })}>{t("cond.editValues")}</SmallButton>
          </Row>
        ) : (
          <TextInput value={cond.value} placeholder={t("cond.listPlaceholder")} aria-label={t("cond.values")} onChange={(e) => set({ value: e.target.value })} />
        )
      ) : null}
      {needsValue ? (
        <KqlInput value={cond.value} onChange={(value) => set({ value })} schema={schema} placeholder={t("cond.value")} ariaLabel={t("cond.value")} className="text-xs" />
      ) : null}
      {needsValue || cond.op === "between" || cond.op === "in" || cond.op === "not in" ? (
        <Row>
          <span className="text-[10px] text-muted-foreground">{t("cond.valueType")}</span>
          <SelectInput ariaLabel={t("cond.valueType")} value={cond.vtype} onChange={(vtype) => set({ vtype: vtype as ValueType })} options={VALUE_TYPES.map((v) => ({ value: v, label: t(`cond.types.${v}`) }))} className="w-auto" />
        </Row>
      ) : null}
    </Card>
  );
}

function TransformEditor({
  col,
  columns,
  scriptSchema,
  filterSchema,
  onChange,
  onRemove,
}: {
  col: TransformColumn;
  columns: string[];
  scriptSchema: KqlSchema;
  filterSchema: KqlSchema;
  onChange: (c: TransformColumn) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("query-flow");
  const set = (patch: Partial<TransformColumn>) => onChange({ ...col, ...patch });
  const args = FN_ARGS[col.fn] ?? {};
  const setClause = (id: string, patch: Partial<ConditionalClause>) => set({ clauses: col.clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <Card>
      <Row>
        <SelectInput ariaLabel={t("transform.kind")} value={col.kind} onChange={(kind) => set({ kind: kind as TransformKind })} options={TRANSFORM_KINDS.map((k) => ({ value: k, label: t(`transform.kinds.${k}`) }))} />
        <IconButton label={t("transform.remove")} onClick={onRemove} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
      </Row>

      {col.kind === "custom" ? (
        <>
          <TextInput value={col.alias} placeholder={t("transform.newName")} aria-label={t("transform.newName")} onChange={(e) => set({ alias: e.target.value })} />
          <KqlInput multiline rows={2} value={col.expr} onChange={(expr) => set({ expr })} schema={scriptSchema} placeholder={t("transform.exprPlaceholder")} ariaLabel={t("transform.expr")} className="text-xs" />
        </>
      ) : null}

      {col.kind === "fn" ? (
        <>
          <ColumnInput value={col.column} onChange={(column) => set({ column })} columns={columns} placeholder={t("transform.column")} ariaLabel={t("transform.column")} />
          <SelectInput ariaLabel={t("transform.function")} value={col.fn} onChange={(fn) => set({ fn: fn as TransformFn })} options={TRANSFORM_FNS.map((f) => ({ value: f, label: t(`transform.fns.${f}`) }))} />
          {args.a ? <TextInput value={col.a} placeholder={t(`transform.args.${args.a}`)} aria-label={t(`transform.args.${args.a}`)} onChange={(e) => set({ a: e.target.value })} /> : null}
          {args.b ? <TextInput value={col.b} placeholder={t(`transform.args.${args.b}`)} aria-label={t(`transform.args.${args.b}`)} onChange={(e) => set({ b: e.target.value })} /> : null}
          {col.fn === "replace" ? (
            <label className="flex items-center gap-1.5 text-[11px] text-foreground">
              <input type="checkbox" checked={col.regex} onChange={(e) => set({ regex: e.target.checked })} />
              {t("transform.regex")}
            </label>
          ) : null}
          <TextInput value={col.alias} placeholder={t("transform.replaceInPlace")} aria-label={t("transform.resultName")} onChange={(e) => set({ alias: e.target.value })} />
        </>
      ) : null}

      {col.kind === "split" ? (
        <>
          <ColumnInput value={col.column} onChange={(column) => set({ column })} columns={columns} placeholder={t("transform.column")} ariaLabel={t("transform.column")} />
          <Row>
            <TextInput value={col.delimiter} placeholder={t("transform.delimiter")} aria-label={t("transform.delimiter")} onChange={(e) => set({ delimiter: e.target.value })} />
            <TextInput value={col.a} placeholder={t("transform.piece")} aria-label={t("transform.piece")} onChange={(e) => set({ a: e.target.value })} className="w-20" />
          </Row>
          <TextInput value={col.alias} placeholder={t("transform.newName")} aria-label={t("transform.newName")} onChange={(e) => set({ alias: e.target.value })} />
        </>
      ) : null}

      {col.kind === "merge" ? (
        <>
          <TextInput value={col.columns.join(", ")} placeholder={t("transform.mergeColumns")} aria-label={t("transform.mergeColumns")} onChange={(e) => set({ columns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          <Row>
            <TextInput value={col.separator} placeholder={t("transform.separator")} aria-label={t("transform.separator")} onChange={(e) => set({ separator: e.target.value })} />
            <TextInput value={col.alias} placeholder={t("transform.newName")} aria-label={t("transform.newName")} onChange={(e) => set({ alias: e.target.value })} />
          </Row>
        </>
      ) : null}

      {col.kind === "conditional" ? (
        <>
          <TextInput value={col.alias} placeholder={t("transform.newName")} aria-label={t("transform.newName")} onChange={(e) => set({ alias: e.target.value })} />
          {col.clauses.map((cl, i) => (
            <div key={cl.id} className="space-y-1 rounded-md border border-dashed border-border p-1.5">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">{i === 0 ? t("transform.if") : t("transform.elseIf")}</p>
              <ConditionEditor cond={cl.condition} columns={columns} schema={filterSchema} onChange={(condition) => setClause(cl.id, { condition })} onRemove={() => set({ clauses: col.clauses.filter((c) => c.id !== cl.id) })} />
              <Row>
                <span className="text-[11px] text-muted-foreground">{t("transform.then")}</span>
                <TextInput value={cl.then} aria-label={t("transform.then")} onChange={(e) => setClause(cl.id, { then: e.target.value })} />
              </Row>
            </div>
          ))}
          <SmallButton onClick={() => set({ clauses: [...col.clauses, { id: uid("cl"), condition: newCondition(), then: "", thenType: "auto" }] })}>
            <Plus className="h-3 w-3" />
            {t("transform.addClause")}
          </SmallButton>
          <Row>
            <span className="text-[11px] text-muted-foreground">{t("transform.otherwise")}</span>
            <TextInput value={col.otherwise} aria-label={t("transform.otherwise")} onChange={(e) => set({ otherwise: e.target.value })} />
          </Row>
        </>
      ) : null}
    </Card>
  );
}

/** The dimensions / metrics / having form of a Group step (also used by the Group By dialog). */
export function GroupFields({ d, columns, filterSchema, onChange }: { d: GroupData; columns: string[]; filterSchema: KqlSchema; onChange: (data: Record<string, unknown>) => void }) {
  const t = useTranslations("query-flow");
  return (
    <div className="space-y-2">
      <FieldLabel>{t("group.dimensions")}</FieldLabel>
      {d.dimensions.map((dim) => (
        <Row key={dim.id}>
          <ColumnInput value={dim.field} onChange={(field) => onChange({ ...d, dimensions: d.dimensions.map((x) => (x.id === dim.id ? { ...x, field } : x)) })} columns={columns} placeholder={t("group.field")} ariaLabel={t("group.field")} />
          <SelectInput ariaLabel={t("group.bucket")} value={dim.bucket} onChange={(bucket) => onChange({ ...d, dimensions: d.dimensions.map((x) => (x.id === dim.id ? { ...x, bucket: bucket as typeof dim.bucket } : x)) })} options={BUCKETS.map((b) => ({ value: b, label: t(`group.buckets.${b}`) }))} className="w-24" />
          <IconButton label={t("group.removeDimension")} onClick={() => onChange({ ...d, dimensions: d.dimensions.filter((x) => x.id !== dim.id) })} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </Row>
      ))}
      <SmallButton onClick={() => onChange({ ...d, dimensions: [...d.dimensions, { id: uid("d"), field: "", bucket: "none" }] })}>
        <Plus className="h-3 w-3" />
        {t("group.addDimension")}
      </SmallButton>
      <FieldLabel>{t("group.metrics")}</FieldLabel>
      {d.metrics.map((m) => {
        const setM = (patch: Partial<typeof m>) => onChange({ ...d, metrics: d.metrics.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) });
        return (
          <Card key={m.id}>
            <Row>
              <SelectInput ariaLabel={t("group.metric")} value={m.fn} onChange={(fn) => setM({ fn: fn as MetricKind })} options={METRIC_KINDS.map((k) => ({ value: k, label: t(`group.metricKinds.${k}`) }))} />
              <IconButton label={t("group.removeMetric")} onClick={() => onChange({ ...d, metrics: d.metrics.filter((x) => x.id !== m.id) })} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </Row>
            {METRIC_NEEDS_FIELD[m.fn] ? <ColumnInput value={m.field} onChange={(field) => setM({ field })} columns={columns} placeholder={t("group.field")} ariaLabel={t("group.field")} /> : null}
            {m.fn === "ratio" ? <ColumnInput value={m.field2} onChange={(field2) => setM({ field2 })} columns={columns} placeholder={t("group.denominator")} ariaLabel={t("group.denominator")} /> : null}
            {m.fn === "percentile" ? <TextInput value={m.arg} placeholder="90" aria-label={t("group.percentile")} onChange={(e) => setM({ arg: e.target.value })} /> : null}
            {m.fn === "join" ? <TextInput value={m.arg} placeholder={t("group.separator")} aria-label={t("group.separator")} onChange={(e) => setM({ arg: e.target.value })} /> : null}
            {m.fn === "count_if" || m.fn === "sum_if" ? <KqlInput value={m.arg} onChange={(arg) => setM({ arg })} schema={filterSchema} placeholder={t("group.condition")} ariaLabel={t("group.condition")} className="text-xs" /> : null}
          </Card>
        );
      })}
      <SmallButton onClick={() => onChange({ ...d, metrics: [...d.metrics, { id: uid("m"), fn: "sum", field: "", field2: "", arg: "" }] })}>
        <Plus className="h-3 w-3" />
        {t("group.addMetric")}
      </SmallButton>
      <div>
        <FieldLabel>{t("group.having")}</FieldLabel>
        <TextInput value={d.having} placeholder={t("group.havingPlaceholder")} aria-label={t("group.having")} onChange={(e) => onChange({ ...d, having: e.target.value })} />
      </div>
    </div>
  );
}

export function NodeInspector(props: InspectorProps) {
  const { node, columns, tables, files, queryTables, queries, currentQueryId, teamId, scriptSchema, filterSchema, issue, previewColumns, onChange, onMeta, onDelete } = props;
  const t = useTranslations("query-flow");
  const meta = NODE_META[node.type];
  const Icon = meta.icon;

  const body = (() => {
    switch (node.type) {
      case "source":
        return <SourceFields value={dataOf(node)} onChange={(v) => onChange({ ...v })} tables={tables} files={files} queryTables={queryTables} queries={queries} currentQueryId={currentQueryId} teamId={teamId} />;

      case "filter": {
        const d = dataOf<FilterData>(node);
        const setCond = (id: string, c: Condition) => onChange({ ...d, conditions: d.conditions.map((x) => (x.id === id ? c : x)) });
        return (
          <div className="space-y-2">
            {d.conditions.length > 1 ? (
              <Row>
                <FieldLabel>{t("filter.combine")}</FieldLabel>
                <SelectInput ariaLabel={t("filter.combine")} value={d.combine} onChange={(combine) => onChange({ ...d, combine })} options={[{ value: "and", label: t("filter.and") }, { value: "or", label: t("filter.or") }]} className="w-auto" />
              </Row>
            ) : null}
            {d.conditions.map((c) => (
              <ConditionEditor key={c.id} cond={c} columns={columns} schema={filterSchema} onChange={(next) => setCond(c.id, next)} onRemove={() => onChange({ ...d, conditions: d.conditions.filter((x) => x.id !== c.id) })} />
            ))}
            <SmallButton onClick={() => onChange({ ...d, conditions: [...d.conditions, newCondition()] })}>
              <Plus className="h-3 w-3" />
              {t("filter.addCondition")}
            </SmallButton>
            <div>
              <FieldLabel>{t("filter.advanced")}</FieldLabel>
              <KqlInput value={d.advanced} onChange={(advanced) => onChange({ ...d, advanced })} schema={filterSchema} placeholder={t("filter.advancedPlaceholder")} ariaLabel={t("filter.advanced")} className="text-xs" />
            </div>
          </div>
        );
      }

      case "transform": {
        const d = dataOf<TransformData>(node);
        return (
          <div className="space-y-2">
            {d.columns.map((c) => (
              <TransformEditor
                key={c.id}
                col={c}
                columns={columns}
                scriptSchema={scriptSchema}
                filterSchema={filterSchema}
                onChange={(next) => onChange({ ...d, columns: d.columns.map((x) => (x.id === c.id ? next : x)) })}
                onRemove={() => onChange({ ...d, columns: d.columns.filter((x) => x.id !== c.id) })}
              />
            ))}
            <SmallButton onClick={() => onChange({ ...d, columns: [...d.columns, newTransformColumn("custom")] })}>
              <Plus className="h-3 w-3" />
              {t("transform.addColumn")}
            </SmallButton>
          </div>
        );
      }

      case "join": {
        const d = dataOf<JoinData>(node);
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{t("join.hint")}</p>
            <SourceFields value={d.rightSource} onChange={(rightSource) => onChange({ ...d, rightSource })} tables={tables} files={files} queryTables={queryTables} queries={queries} currentQueryId={currentQueryId} teamId={teamId} />
            <div>
              <FieldLabel>{t("join.alias")}</FieldLabel>
              <TextInput value={d.alias} placeholder={t("join.aliasPlaceholder")} aria-label={t("join.alias")} onChange={(e) => onChange({ ...d, alias: e.target.value })} />
            </div>
            <div>
              <FieldLabel>{t("join.leftKey")}</FieldLabel>
              <ColumnInput value={d.leftKey} onChange={(leftKey) => onChange({ ...d, leftKey })} columns={columns} ariaLabel={t("join.leftKey")} />
            </div>
            <div>
              <FieldLabel>{t("join.rightKey")}</FieldLabel>
              <TextInput value={d.rightKey} aria-label={t("join.rightKey")} onChange={(e) => onChange({ ...d, rightKey: e.target.value })} />
            </div>
            <div>
              <FieldLabel>{t("join.kind")}</FieldLabel>
              <SelectInput ariaLabel={t("join.kind")} value={d.kind} onChange={(kind) => onChange({ ...d, kind: kind === "left" ? "left" : "inner" })} options={[{ value: "inner", label: t("join.inner") }, { value: "left", label: t("join.left") }]} />
            </div>
            <div>
              <FieldLabel>{t("join.expand")}</FieldLabel>
              <TextInput value={d.expand.join(", ")} placeholder={t("join.expandPlaceholder")} aria-label={t("join.expand")} onChange={(e) => onChange({ ...d, expand: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          </div>
        );
      }

      case "union":
        return <p className="text-[11px] text-muted-foreground">{t("union.hint")}</p>;

      case "group":
        return <GroupFields d={dataOf<GroupData>(node)} columns={columns} filterSchema={filterSchema} onChange={onChange} />;

      case "select": {
        const d = dataOf<SelectData>(node);
        return (
          <div className="space-y-2">
            {d.columns.map((c, i) => (
              <Row key={c.id}>
                <ColumnInput value={c.column} onChange={(column) => onChange({ ...d, columns: d.columns.map((x) => (x.id === c.id ? { ...x, column } : x)) })} columns={columns} placeholder={t("select.column")} ariaLabel={t("select.column")} />
                <TextInput value={c.alias} placeholder={t("select.alias")} aria-label={t("select.alias")} onChange={(e) => onChange({ ...d, columns: d.columns.map((x) => (x.id === c.id ? { ...x, alias: e.target.value } : x)) })} />
                <IconButton label={t("select.moveUp")} disabled={i === 0} onClick={() => { const cols = [...d.columns]; [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; onChange({ ...d, columns: cols }); }}>↑</IconButton>
                <IconButton label={t("select.remove")} onClick={() => onChange({ ...d, columns: d.columns.filter((x) => x.id !== c.id) })} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
              </Row>
            ))}
            <Row>
              <SmallButton onClick={() => onChange({ ...d, columns: [...d.columns, { id: uid("s"), column: "", alias: "" }] })}>
                <Plus className="h-3 w-3" />
                {t("select.add")}
              </SmallButton>
              <SmallButton disabled={previewColumns.length === 0} title={t("select.useAllHint")} onClick={() => onChange({ ...d, columns: previewColumns.map((c) => ({ id: uid("s"), column: c, alias: "" })) })}>
                {t("select.useAll")}
              </SmallButton>
            </Row>
          </div>
        );
      }

      case "distinct": {
        const d = dataOf<DistinctData>(node);
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{t("distinct.hint")}</p>
            <TextInput value={d.columns.join(", ")} placeholder={t("distinct.placeholder")} aria-label={t("distinct.columns")} onChange={(e) => onChange({ ...d, columns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </div>
        );
      }

      case "sort": {
        const d = dataOf<SortData>(node);
        return (
          <div className="space-y-2">
            {d.keys.map((k) => (
              <Row key={k.id}>
                <ColumnInput value={k.field} onChange={(field) => onChange({ ...d, keys: d.keys.map((x) => (x.id === k.id ? { ...x, field } : x)) })} columns={columns} placeholder={t("sort.key")} ariaLabel={t("sort.key")} />
                <SelectInput ariaLabel={t("sort.direction")} value={k.dir} onChange={(dir) => onChange({ ...d, keys: d.keys.map((x) => (x.id === k.id ? { ...x, dir: dir === "desc" ? "desc" : "asc" } : x)) })} options={[{ value: "asc", label: t("sort.asc") }, { value: "desc", label: t("sort.desc") }]} className="w-24" />
                <IconButton label={t("sort.remove")} onClick={() => onChange({ ...d, keys: d.keys.filter((x) => x.id !== k.id) })} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
              </Row>
            ))}
            <SmallButton onClick={() => onChange({ ...d, keys: [...d.keys, { id: uid("k"), field: "", dir: "asc" }] })}>
              <Plus className="h-3 w-3" />
              {t("sort.add")}
            </SmallButton>
            <p className="text-[10px] text-muted-foreground">{t("sort.hint")}</p>
          </div>
        );
      }

      case "limit": {
        const d = dataOf<LimitData>(node);
        const num = (raw: string): number | null => (raw.trim() === "" || !Number.isFinite(Number(raw)) ? null : Math.floor(Number(raw)));
        return (
          <div className="space-y-2">
            <div>
              <FieldLabel>{t("limit.keep")}</FieldLabel>
              <TextInput type="number" min={1} value={d.limit ?? ""} aria-label={t("limit.keep")} onChange={(e) => onChange({ ...d, limit: num(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>{t("limit.skip")}</FieldLabel>
              <TextInput type="number" min={0} value={d.offset ?? ""} aria-label={t("limit.skip")} onChange={(e) => onChange({ ...d, offset: num(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>{t("limit.dropLast")}</FieldLabel>
              <TextInput type="number" min={0} value={d.droplast ?? ""} aria-label={t("limit.dropLast")} onChange={(e) => onChange({ ...d, droplast: num(e.target.value) })} />
            </div>
            <div>
              <FieldLabel>{t("limit.tail")}</FieldLabel>
              <TextInput type="number" min={1} value={d.tail ?? ""} aria-label={t("limit.tail")} onChange={(e) => onChange({ ...d, tail: num(e.target.value) })} />
            </div>
            <p className="text-[10px] text-muted-foreground">{t("limit.orderHint")}</p>
          </div>
        );
      }

      case "unpivot": {
        const d = dataOf<UnpivotData>(node);
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{t("unpivot.hint")}</p>
            <SelectInput ariaLabel={t("unpivot.mode")} value={d.except ? "except" : "these"} onChange={(v) => onChange({ ...d, except: v === "except" })} options={[{ value: "these", label: t("unpivot.these") }, { value: "except", label: t("unpivot.except") }]} />
            <div>
              <FieldLabel>{t("unpivot.columns")}</FieldLabel>
              <TextInput value={d.columns.join(", ")} placeholder={t("unpivot.columnsPlaceholder")} aria-label={t("unpivot.columns")} onChange={(e) => onChange({ ...d, columns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              {columns.length > 0 ? (
                <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {columns.map((c) => (
                    <button key={c} type="button" aria-pressed={d.columns.includes(c)} onClick={() => onChange({ ...d, columns: d.columns.includes(c) ? d.columns.filter((x) => x !== c) : [...d.columns, c] })} className={`rounded border px-1.5 py-0.5 text-[11px] ${d.columns.includes(c) ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}>{c}</button>
                  ))}
                </div>
              ) : null}
            </div>
            <Row>
              <TextInput value={d.attribute} placeholder="Attribute" aria-label={t("unpivot.attribute")} onChange={(e) => onChange({ ...d, attribute: e.target.value })} />
              <TextInput value={d.value} placeholder="Value" aria-label={t("unpivot.value")} onChange={(e) => onChange({ ...d, value: e.target.value })} />
            </Row>
          </div>
        );
      }

      case "pivot": {
        const d = dataOf<PivotData>(node);
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{t("pivot.hint")}</p>
            <div>
              <FieldLabel>{t("pivot.column")}</FieldLabel>
              <ColumnInput value={d.column} onChange={(column) => onChange({ ...d, column })} columns={columns} ariaLabel={t("pivot.column")} />
            </div>
            <SelectInput ariaLabel={t("group.bucket")} value={d.bucket} onChange={(bucket) => onChange({ ...d, bucket })} options={BUCKETS.map((b) => ({ value: b, label: t(`group.buckets.${b}`) }))} />
          </div>
        );
      }

      case "transpose": {
        const d = dataOf<TransposeData>(node);
        return (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{t("transpose.hint")}</p>
            <label className="flex items-center gap-1.5 text-xs text-foreground">
              <input type="checkbox" checked={d.header} onChange={(e) => onChange({ ...d, header: e.target.checked })} />
              {t("transpose.header")}
            </label>
          </div>
        );
      }

      case "output": {
        const d = dataOf<OutputData>(node);
        return (
          <div className="space-y-2">
            <div>
              <FieldLabel>{t("output.kind")}</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {OUTPUT_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={d.kind === k}
                    onClick={() => onChange({ ...d, kind: k })}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium ${d.kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}
                  >
                    {t(`output.kinds.${k}`)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>{t("output.title")}</FieldLabel>
              <TextInput value={d.title} aria-label={t("output.title")} onChange={(e) => onChange({ ...d, title: e.target.value })} />
            </div>
            <p className="text-[10px] text-muted-foreground">{t("output.hint")}</p>
          </div>
        );
      }

      case "advanced": {
        const d = dataOf<AdvancedData>(node);
        return (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{t("advanced.hint")}</p>
            <KqlInput multiline rows={8} value={d.script} onChange={(script) => onChange({ ...d, script })} schema={scriptSchema} ariaLabel={t("advanced.label")} className="text-xs" />
          </div>
        );
      }

      default:
        return null;
    }
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-white ${meta.header}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{t(`nodes.${node.type}.title`)}</p>
          <p className="truncate text-[11px] text-muted-foreground">{t(`nodes.${node.type}.hint`)}</p>
        </div>
        <IconButton label={t("inspector.delete")} onClick={onDelete} danger><Trash2 className="h-4 w-4" /></IconButton>
      </div>

      {issue ? (
        <div role="alert" className={`rounded-md border p-2 text-xs ${issue.kind === "engine" ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
          <p className="font-semibold">{issue.kind === "engine" ? t("inspector.needsEngine") : t("inspector.problem")}</p>
          <p>{issue.message}</p>
        </div>
      ) : null}

      {body}

      <details className="rounded-md border border-border p-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">{t("inspector.stepSettings")}</summary>
        <div className="mt-2 space-y-2">
          <div>
            <FieldLabel>{t("inspector.stepName")}</FieldLabel>
            <TextInput value={node.label ?? ""} placeholder={t(`nodes.${node.type}.title`)} aria-label={t("inspector.stepName")} onChange={(e) => onMeta({ label: e.target.value || undefined })} />
          </div>
          <div>
            <FieldLabel>{t("inspector.stepNote")}</FieldLabel>
            <TextInput value={node.note ?? ""} aria-label={t("inspector.stepNote")} onChange={(e) => onMeta({ note: e.target.value || undefined })} />
          </div>
          {node.type !== "source" && node.type !== "output" ? (
            <label className="flex items-center gap-1.5 text-[11px] text-foreground">
              <input type="checkbox" checked={!!node.disabled} onChange={(e) => onMeta({ disabled: e.target.checked || undefined })} />
              {t("inspector.disabled")}
            </label>
          ) : null}
        </div>
      </details>
    </div>
  );
}
