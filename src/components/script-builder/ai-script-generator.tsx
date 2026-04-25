'use client';

import React, { useState } from 'react';
import { useScriptGenerationContext, buildAiDraftSystemPrompt } from '@/hooks/use-script-generation-context';
import { useSession } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Zap, Database, Code } from 'lucide-react';

interface AIScriptGeneratorProps {
  onGenerate?: (config: any) => void;
  onClose?: () => void;
}

/**
 * Componente para generar scripts con IA usando contexto completo de bricks
 */
export function AIScriptGenerator({ onGenerate, onClose }: AIScriptGeneratorProps) {
  const { context, loading: contextLoading, error: contextError } = useScriptGenerationContext();
  const { activeTeamId } = useSession();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || !activeTeamId) return;

    setGenerating(true);
    setError(null);
    try {
      const systemPrompt = buildAiDraftSystemPrompt(context);

      const response = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrompt: prompt,
          systemPrompt,
          context,
          teamId: activeTeamId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to generate script (${response.status})`);
      }

      const script = await response.json();
      setGeneratedScript(script);

      if (onGenerate) {
        onGenerate(script);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('Error generating script:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">Genera scripts con IA</p>
        <p className="text-xs text-muted-foreground mb-4">
          Describe qué quieres hacer. El IA usará el contexto de tus bricks, databases y nodos disponibles.
        </p>
      </div>

      {contextError && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{contextError}</div>}
      {error && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">{error}</div>}

      {contextLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando contexto de bricks...
        </div>
      ) : (
        <>
          {/* Info de contexto disponible */}
          {context && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2 flex items-center gap-2">
                <Database className="h-3 w-3 text-accent" />
                <span>{context.availableDatabases.length} databases</span>
              </div>
              <div className="rounded-md bg-muted/50 p-2 flex items-center gap-2">
                <Code className="h-3 w-3 text-accent" />
                <span>{context.nodeTypes.length} nodos</span>
              </div>
              <div className="rounded-md bg-muted/50 p-2 flex items-center gap-2">
                <Zap className="h-3 w-3 text-accent" />
                <span>{context.exampleScripts.length} ejemplos</span>
              </div>
            </div>
          )}

          {/* Input y botón */}
          <div className="space-y-2">
            <textarea
              placeholder="Ej: 'Crear un workflow que lea formularios y guarde datos en mi database de contactos'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
              disabled={generating}
            />

            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="flex-1 gap-2">
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Generar script
                  </>
                )}
              </Button>
              {onClose && (
                <Button variant="outline" onClick={onClose} disabled={generating}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* Script generado */}
          {generatedScript && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Script generado:</p>
              <pre className="text-xs bg-background p-2 rounded overflow-auto max-h-[200px] text-muted-foreground">
                {JSON.stringify(generatedScript, null, 2)}
              </pre>
            </div>
          )}

          {/* Ejemplos disponibles */}
          {context && context.exampleScripts.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Ejemplos de workflows:</p>
              <div className="space-y-1">
                {context.exampleScripts.map((example, idx) => (
                  <div
                    key={idx}
                    className="text-xs p-2 rounded bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setPrompt(example.description)}
                  >
                    <p className="font-medium text-foreground">{example.name}</p>
                    <p className="text-muted-foreground text-[11px]">{example.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
