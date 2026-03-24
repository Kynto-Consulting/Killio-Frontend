"use client";

import React from "react";
import { BarChart2, LineChart as LineChartIcon, PieChart as PieChartIcon, Settings2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";

interface GraphBrickProps {
  id: string;
  config: {
    type: 'line' | 'bar' | 'pie';
    title?: string;
    data?: any[];
  } | undefined;
  onUpdate: (newConfig: any) => void;
  readonly?: boolean;
}

export const UnifiedGraphBrick: React.FC<GraphBrickProps> = ({ id, config, onUpdate, readonly }) => {
  const type = config?.type || 'line';
  const data = config?.data || [
    { name: 'A', value: 10 },
    { name: 'B', value: 20 },
    { name: 'C', value: 15 },
  ];

  const handleTypeChange = (newType: string) => {
    onUpdate({ ...config, type: newType });
  };

  return (
    <div className="w-full bg-card border border-border rounded-xl p-4 shadow-sm group/graph">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
           <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
              <BarChart2 className="w-4 h-4" />
           </div>
           <h4 className="text-sm font-bold uppercase tracking-wider opacity-80">{config?.title || 'Análisis de Datos'}</h4>
        </div>
        {!readonly && (
          <div className="flex bg-muted/30 p-1 rounded-lg gap-1 border border-border/50">
             <Button 
               variant={type === 'line' ? 'default' : 'ghost'} 
               size="sm" 
               className="h-7 w-7 p-0"
               onClick={() => handleTypeChange('line')}
             >
               <LineChartIcon className="w-3.5 h-3.5" />
             </Button>
             <Button 
               variant={type === 'bar' ? 'default' : 'ghost'} 
               size="sm" 
               className="h-7 w-7 p-0"
               onClick={() => handleTypeChange('bar')}
             >
               <BarChart2 className="w-3.5 h-3.5" />
             </Button>
          </div>
        )}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
              <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1 }}
              />
              <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
              <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--accent))" 
                strokeWidth={3} 
                dot={{ r: 4, fill: 'hsl(var(--card))', stroke: 'hsl(var(--accent))', strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {!readonly && (
         <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-center opacity-0 group-hover/graph:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1.5 font-medium tracking-tighter cursor-help">
               <Settings2 className="w-3 h-3" /> Data is synchronized from linked tables
            </span>
         </div>
      )}
    </div>
  );
};
