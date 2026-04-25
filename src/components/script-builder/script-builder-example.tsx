'use client';

/**
 * Ejemplo de integración del AI Script Generator en el Script Builder
 * Muestra cómo usar AIScriptGenerator para permitir a usuarios crear workflows
 */

import React, { useState } from 'react';
import { AIScriptGenerator } from '@/components/script-builder/ai-script-generator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Brain, Settings } from 'lucide-react';

interface ScriptBuilderPageProps {
  scriptId?: string;
}

/**
 * Página/modal de Script Builder con integración de AI Draft Studio
 */
export function ScriptBuilderExample({ scriptId }: ScriptBuilderPageProps) {
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any | null>(null);
  const [manualMode, setManualMode] = useState(!showAIGenerator);

  const handleAIGenerate = (script: any) => {
    setGeneratedScript(script);
    // Aquí se cargaría el script generado en el editor visual
    // Y se pasaría al componente de edición de nodos
  };

  return (
    <div className="h-full w-full flex flex-col">
      <Tabs defaultValue={manualMode ? 'manual' : 'ai'} className="flex-1 flex flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="manual" className="flex-1 gap-2">
            <Settings className="h-4 w-4" />
            Editor Manual
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1 gap-2">
            <Brain className="h-4 w-4" />
            Generar con IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="flex-1 overflow-auto">
          <div className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-2">Editor de Scripts Manual</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Arrastra nodos desde la paleta, conecta entradas/salidas y configura cada paso.
              </p>
            </div>

            {/* Aquí iría el canvas de edición visual de nodos */}
            <div className="rounded-lg border border-dashed border-border bg-muted/20 h-96 flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">Canvas de edición visual</p>
                <p className="text-xs text-muted-foreground">(Drag & drop nodes aquí)</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Agregar Nodo
              </Button>
              <Button>Guardar Script</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="flex-1 overflow-auto">
          <div className="p-6">
            <AIScriptGenerator
              onGenerate={handleAIGenerate}
              onClose={() => {
                setManualMode(true);
              }}
            />

            {generatedScript && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Script generado:</h4>
                <div className="space-y-2">
                  {generatedScript.nodes?.map((node: any, idx: number) => (
                    <div key={idx} className="rounded-md border border-border bg-card p-3">
                      <p className="text-xs font-mono text-muted-foreground">{node.kind}</p>
                      <p className="text-sm font-medium text-foreground mt-1">{node.label || 'Sin nombre'}</p>
                      {node.config && (
                        <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto max-h-24">
                          {JSON.stringify(node.config, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-4 border-t border-border">
                  <Button
                    onClick={() => {
                      // Cargar el script generado en el editor manual
                      setManualMode(true);
                    }}
                    className="flex-1"
                  >
                    Continuar editando
                  </Button>
                  <Button variant="outline" onClick={() => setGeneratedScript(null)}>
                    Generar otro
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Ejemplo de uso en una página
 */
export default function ScriptBuilderPage() {
  return (
    <div className="h-screen bg-background">
      <div className="h-full flex flex-col">
        <div className="border-b border-border px-6 py-4">
          <h1 className="text-2xl font-bold text-foreground">Script Builder</h1>
          <p className="text-sm text-muted-foreground">
            Crea workflows automatizados para sincronizar datos, actualizar tarjetas, consultar databases y más
          </p>
        </div>
        <div className="flex-1">
          <ScriptBuilderExample />
        </div>
      </div>
    </div>
  );
}
