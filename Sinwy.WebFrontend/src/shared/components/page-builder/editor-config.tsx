import { Button } from "#/shared/components/ui/button";
import { FreeGridEditor } from "./FreeGridEditor";
import { type BuilderConfig, renderConfig } from "./render-config";

const { Section, Heading, FreeGrid } = renderConfig.components;

export const editorConfig: BuilderConfig = {
	...renderConfig,
	categories: {
		layout: { title: "Layout", components: ["Section", "FreeGrid"] },
		content: { title: "Content", components: ["Heading"] },
	},
	components: {
		Section: {
			...Section,
			label: "Section",
			defaultProps: { items: [], tone: "plain" },
		},
		Heading: {
			...Heading,
			label: "Heading",
			defaultProps: { text: "Heading", level: "2" },
		},
		FreeGrid: {
			...FreeGrid,
			label: "Free grid",
			fields: {
				items: { type: "slot" },
				layout: {
					type: "custom",
					label: "Arrangement",
					render: ({ onChange }) => (
						<div className="grid gap-2 text-muted-foreground text-sm">
							<p>
								Drag a block's ⠿ handle to move it, and its edges to resize it.
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onChange({ desktop: {} })}
							>
								Reset layout
							</Button>
						</div>
					),
				},
			},
			defaultProps: { items: [], layout: { desktop: {} } },
			render: (props) =>
				props.puck.isEditing ? (
					<FreeGridEditor {...props} />
				) : (
					<FreeGrid.render {...props} />
				),
		},
	},
};
