/**
 * Hook para obtener y cachear contexto completo de scripts para AI Draft Studio
 */
import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers/session-provider';

export interface BrickTypeInfo {
  kind: string;
  displayName: string;
  description: string;
  methods: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
    returns: string;
  }>;
}

export interface DatabaseBrickInfo {
  id: string;
  parentId: string;
  parentType: 'document' | 'card';
  parentTitle: string;
  title: string;
  rowCount: number;
  columnCount: number;
  columns: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface NodeTypeInfo {
  kind: string;
  category: string;
  displayName: string;
  description: string;
  configSchema: any;
}

export interface ScriptGenerationContext {
  brickTypes: Record<string, BrickTypeInfo>;
  availableDatabases: DatabaseBrickInfo[];
  nodeTypes: NodeTypeInfo[];
  exampleScripts: any[];
}

export function useScriptGenerationContext() {
  const { activeTeamId, accessToken } = useSession();
  const [context, setContext] = useState<ScriptGenerationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTeamId || !accessToken) return;

    let cancelled = false;

    const loadContext = async () => {
      setLoading(true);
      setError(null);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_KILLIO_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/scripts/context/${activeTeamId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch context: ${response.statusText}`);
        }

        const data = await response.json();
        if (!cancelled) {
          setContext(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          console.error('Error loading script context:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadContext();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId, accessToken]);

  return { context, loading, error };
}

/**
 * Construir prompt de sistema para AI Draft Studio con contexto completo
 */
export function buildAiDraftSystemPrompt(context: ScriptGenerationContext | null): string {
  if (!context) {
    return `You are an AI assistant that helps users create scripts and automation workflows.`;
  }

  const brickTypesText = Object.values(context.brickTypes)
    .map(
      (bt) =>
        `- ${bt.displayName} (${bt.kind}): ${bt.description}${
          bt.methods.length > 0 ? `\n  Métodos: ${bt.methods.map((m) => m.name).join(', ')}` : ''
        }`,
    )
    .join('\n');

  const databasesText = context.availableDatabases
    .map(
      (db) =>
        `- ${db.title} [${db.id}] en ${db.parentType}:${db.parentTitle}\n  Columnas: ${db.columns
          .map((c) => `${c.name}(${c.type})`)
          .join(', ')}\n  Registros: ${db.rowCount}`,
    )
    .join('\n');

  const nodeTypesText = context.nodeTypes
    .map((nt) => `- ${nt.displayName} (${nt.kind}) - ${nt.category}: ${nt.description}`)
    .join('\n');

  return `You are an AI assistant that helps users create scripts and automation workflows in Killio.

=== TIPOS DE BRICKS DISPONIBLES ===
${brickTypesText}

=== DATABASE BRICKS DISPONIBLES EN ESTE TEAM ===
${databasesText || '(No hay bases de datos creadas aún)'}

=== NODOS DISPONIBLES PARA SCRIPTS ===
${nodeTypesText}

CAPACIDADES:
- Consultar database bricks con query, insert, upsert, update, delete, count
- Crear y actualizar tarjetas automáticamente
- Ejecutar transformaciones de datos (JSON mapping, templates, regex)
- Disparar acciones por webhook o manualmente
- Procesar datos batch
- Integrar con APIs externas via HTTP

EJEMPLO DE WORKFLOW:
1. Disparo (webhook o manual)
2. Listar/Consultar database bricks
3. Transformar datos si es necesario
4. Ejecutar acción (crear tarjeta, actualizar, HTTP request)
5. Opcional: Guardar resultados en database

Cuando el usuario solicite un script, diseña un workflow coherente usando los nodos disponibles.
Si hay database bricks disponibles, sugiere usarlos en lugar de tablas simples.
Proporciona la configuración JSON correcta para cada nodo.`;
}
