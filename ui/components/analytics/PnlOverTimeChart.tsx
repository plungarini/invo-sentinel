"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HyperliquidLedgerUpdate } from "@daemon/types.js";
import Card from "@/components/shared/Card";
import type { PnlOverTimePoint } from "@/types/ui";
import { formatUsd } from "@/lib/format";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const COLOR_PROFIT = "#11bb91";
const COLOR_LOSS = "#ff5000";
const COLOR_BORDER = "#232326";
const COLOR_TEXT_MUTED = "#8b8b90";

function formatDate(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTickUsd(v: number): string {
	// Whole dollars on the axis - decimals just eat width without adding useful precision here.
	return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** Compact axis label on narrow screens - "$1.2k" instead of "$1,234" eats far less horizontal space. */
function formatTickUsdCompact(v: number): string {
	const rounded = Math.round(v);
	if (Math.abs(rounded) >= 1000) return `$${(rounded / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return `$${rounded}`;
}

interface TransferMarker {
	x: string;
	isDeposit: boolean;
	amountUsd: number;
}

/**
 * Recharts renders a ReferenceLine label as bare floating SVG text with no
 * background - right at the top of the chart that collides with the y-axis's
 * own top tick label. A small pill behind the text keeps it legible instead
 * of visually merging with whatever grid line/tick happens to sit under it.
 */
function TransferBadgeLabel({
	viewBox,
	text,
	color,
}: {
	viewBox?: { x: number; y: number; width: number; height: number };
	text: string;
	color: string;
}) {
	if (!viewBox) return null;
	const paddingX = 6;
	const width = Math.max(28, text.length * 6.4 + paddingX * 2);
	const height = 17;
	const cx = viewBox.x;
	// A little below the very top edge, so the pill clears the y-axis's own top tick label instead of sitting on top of it.
	const top = viewBox.y + 10;

	return (
		<g>
			<rect
				x={cx - width / 2}
				y={top}
				width={width}
				height={height}
				rx={5}
				fill="#1c1c1f"
				stroke={color}
				strokeOpacity={0.5}
				strokeWidth={1}
			/>
			<text x={cx} y={top + height / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={11} fontWeight={600}>
				{text}
			</text>
		</g>
	);
}

/**
 * Snaps each deposit/withdrawal to the nearest chart point so it can be plotted on a
 * categorical x-axis. Transfers outside the trade-close range still clamp to the
 * nearest edge point rather than being dropped - a deposit that happened just before
 * the first trade closed is exactly the kind of event worth seeing on the chart.
 */
function buildTransferMarkers(pnlOverTime: PnlOverTimePoint[], transfers: HyperliquidLedgerUpdate[] | undefined): TransferMarker[] {
	if (!transfers || pnlOverTime.length === 0) return [];

	const markers = new Map<string, TransferMarker>();
	for (const t of transfers) {
		const amount = t.delta.usdcValue ?? t.delta.amount;
		const parsed = amount != null ? parseFloat(amount) : null;
		if (parsed == null || parsed === 0) continue;

		let nearest = pnlOverTime[0];
		let bestDiff = Infinity;
		for (const point of pnlOverTime) {
			const diff = Math.abs(Date.parse(point.closedAt) - t.time);
			if (diff < bestDiff) {
				bestDiff = diff;
				nearest = point;
			}
		}
		// One marker per snapped point - a later transfer at the same point wins (arbitrary but stable).
		markers.set(nearest.closedAt, { x: nearest.closedAt, isDeposit: parsed > 0, amountUsd: parsed });
	}
	return [...markers.values()];
}

export default function PnlOverTimeChart({
	pnlOverTime,
	transfers,
}: {
	pnlOverTime: PnlOverTimePoint[];
	transfers?: HyperliquidLedgerUpdate[];
}) {
	const transferMarkers = useMemo(() => buildTransferMarkers(pnlOverTime, transfers), [pnlOverTime, transfers]);
	const isMobile = useMediaQuery("(max-width: 767px)");
	// Where the zero-crossing falls in the gradient (0 = top/all-loss, 1 = bottom/all-profit) -
	// lets the area/line fade from teal to red right at the point the cumulative PnL crosses zero.
	const zeroOffset = useMemo(() => {
		const values = pnlOverTime.map((p) => p.cumulativePnlUsd);
		const dataMax = Math.max(...values);
		const dataMin = Math.min(...values);
		if (dataMax <= 0) return 0;
		if (dataMin >= 0) return 1;
		return dataMax / (dataMax - dataMin);
	}, [pnlOverTime]);

	if (pnlOverTime.length < 2) {
		return (
			<Card title="Cumulative PnL">
				<p className="text-sm text-text-muted">Not enough closed trade data yet for a chart.</p>
			</Card>
		);
	}

	// fewer labels fit a narrow phone screen without overlapping than a desktop card
	const maxLabels = isMobile ? 4 : 8;
	const tickInterval = Math.max(0, Math.ceil(pnlOverTime.length / maxLabels) - 1);
	const tickFontSize = isMobile ? 11 : 12;

	return (
		<Card title="Cumulative PnL">
			<div className="h-72 w-full">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={pnlOverTime} margin={{ top: 20, right: isMobile ? 4 : 12, bottom: 0, left: isMobile ? -14 : -20 }}>
						<defs>
							<linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
								<stop offset={Math.max(0, zeroOffset - 0.02)} stopColor={COLOR_PROFIT} />
								<stop offset={Math.min(1, zeroOffset + 0.02)} stopColor={COLOR_LOSS} />
							</linearGradient>
							<linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset={Math.max(0, zeroOffset - 0.02)} stopColor={COLOR_PROFIT} stopOpacity={0.25} />
								<stop offset={Math.min(1, zeroOffset + 0.02)} stopColor={COLOR_LOSS} stopOpacity={0.25} />
							</linearGradient>
						</defs>
						<CartesianGrid stroke={COLOR_BORDER} strokeDasharray="3 3" vertical={false} />
						<ReferenceLine y={0} stroke={COLOR_BORDER} />
						<XAxis
							dataKey="closedAt"
							stroke={COLOR_BORDER}
							tick={{ fill: COLOR_TEXT_MUTED, fontSize: tickFontSize }}
							tickFormatter={formatDate}
							interval={tickInterval}
							tickLine={false}
						/>
						<YAxis
							stroke={COLOR_BORDER}
							tick={{ fill: COLOR_TEXT_MUTED, fontSize: tickFontSize }}
							tickFormatter={isMobile ? formatTickUsdCompact : formatTickUsd}
							tickLine={false}
							width={isMobile ? 40 : 56}
						/>
						<Tooltip
							contentStyle={{ background: "#1c1c1f", border: `1px solid ${COLOR_BORDER}`, borderRadius: 12 }}
							labelStyle={{ color: COLOR_TEXT_MUTED }}
							formatter={(value: number) => [formatUsd(value), "Cumulative PnL"]}
							labelFormatter={formatDate}
						/>
						{transferMarkers.map((m) => {
							const color = m.isDeposit ? COLOR_PROFIT : COLOR_LOSS;
							const text = `${m.isDeposit ? "+" : "-"}${formatUsd(Math.abs(m.amountUsd))}`;
							return (
								<ReferenceLine
									key={m.x}
									x={m.x}
									stroke={color}
									strokeDasharray="4 4"
									strokeOpacity={0.6}
									label={(props: { viewBox?: { x: number; y: number; width: number; height: number } }) => (
										<TransferBadgeLabel viewBox={props.viewBox} text={text} color={color} />
									)}
								/>
							);
						})}
						<Area
							type="monotone"
							dataKey="cumulativePnlUsd"
							stroke="url(#pnlStroke)"
							strokeWidth={2}
							fill="url(#pnlFill)"
							dot={false}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</Card>
	);
}
