import { type BuilderConfig, renderConfig } from "./render-config";

const { Section, Heading } = renderConfig.components;

export const editorConfig: BuilderConfig = {
	...renderConfig,
	categories: {
		layout: { title: "Layout", components: ["Section"] },
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
	},
};
