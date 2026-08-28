import { BarChartAiIcon } from '@/components/icons/Icons';
import Card from '@/components/shared/Card';
import PageHeader from '@/components/shared/PageHeader';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Matches every sibling route page - see app/layout.tsx for why the layout's
// setup-wizard gate must never be statically prerendered.
export const dynamic = 'force-dynamic';

const TOOLS = [
	{
		href: '/tools/portfolio-analysis',
		icon: BarChartAiIcon,
		title: 'Portfolio Analysis',
		description: 'Look up any portfolio by ID and see its trading stats.',
	},
];

export default function ToolsPage() {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Tools" />
			<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-24 pr-3 pt-14 md:pb-6 md:pt-0">
				<div className="flex flex-col gap-2.5">
					{TOOLS.map((tool) => {
						const Icon = tool.icon;
						return (
							<Link
								key={tool.href}
								href={tool.href}
								className="block cursor-pointer transition-opacity duration-150 hover:opacity-90"
							>
								<Card className="flex items-center gap-3.5">
									<div className="flex shrink-0 items-center justify-center rounded-xl bg-accent/15 p-2.5 text-accent">
										<Icon className="h-5 w-5" strokeWidth={2} />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-[15px] font-semibold">{tool.title}</p>
										<p className="truncate text-[13px] text-text-muted">{tool.description}</p>
									</div>
									<ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
								</Card>
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}
