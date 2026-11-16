import type { Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core/rsc";
import type { PuckDocument } from "@sinwy/shared";
import { type BuilderComponents, renderConfig } from "./render-config";

/** The storefront side of the page builder: `Render` from the editor-free entry. */
export function PuckPage({ data }: { data: PuckDocument }) {
	return (
		<Render config={renderConfig} data={data as Data<BuilderComponents>} />
	);
}
