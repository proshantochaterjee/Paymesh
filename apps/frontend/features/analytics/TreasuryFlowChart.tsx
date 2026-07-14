"use client";

import { useTreasuryFlow } from "./queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function TreasuryFlowChart({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useTreasuryFlow(orgId);

  if (isLoading) {
    return (
      <Card className="col-span-full md:col-span-2">
        <CardHeader>
          <CardTitle>Treasury Flow</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) return null;

  // Format data for recharts
  const chartData = data.map(d => {
    const [year, month] = d.month.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return {
      month: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      inflow: Number(d.inflow),
      outflow: Number(d.outflow)
    };
  });

  return (
    <Card className="col-span-full md:col-span-2">
      <CardHeader>
        <CardTitle>Treasury Flow</CardTitle>
        <CardDescription>Inflows vs Outflows over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(val) => `$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Recharts' Formatter<ValueType, NameType> union is impractical to satisfy precisely; both are always plain strings/numbers for this chart's two series.
              formatter={(value: any, name: any) => [
                `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
                String(name).charAt(0).toUpperCase() + String(name).slice(1)
              ]}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Line type="monotone" dataKey="inflow" name="Inflow" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="outflow" name="Outflow" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
