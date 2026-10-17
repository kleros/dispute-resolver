import { Button } from "@kleros/ui-components-library";
import { Component, type ReactNode } from "react";
import { PageMessage } from "../ui";
import { BrandLogo } from "./BrandLogo";
import { Footer } from "./Footer";
import { CONTENT, GUTTER } from "./layout";

interface RootErrorBoundaryProps {
  readonly children?: ReactNode;
}

interface RootErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * The frame of a failure the boundary caught. It sits above the data, wallet and router providers, so it uses none of
 * them: the brand, the message with a reload button, and the footer without a chain. The error's own text is not shown,
 * since it may come from untrusted data.
 */
function RootFailure() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className={`bg-klerosUIComponentsPrimaryPurple dark:bg-klerosUIComponentsLightBlue ${GUTTER}`}>
        <div className={`${CONTENT} flex h-16 items-center`}>
          <BrandLogo />
        </div>
      </header>
      <main className={`flex flex-1 flex-col ${GUTTER}`}>
        <PageMessage
          title="Something went wrong"
          body="The page could not be displayed. Reload it to try again."
          action={
            <Button
              text="Reload"
              onPress={() => {
                window.location.reload();
              }}
            />
          }
        />
      </main>
      <Footer chainLabel={null} explorer={null} />
    </div>
  );
}

/**
 * The last-resort boundary of the provider tree (ARCHITECTURE.md §2.1, §5.7). Sections fail behind their own
 * `SectionBoundary`; only an error outside every section reaches this one, which keeps a minimal frame instead of the
 * blank page of spec §2.1 (D-36).
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <RootFailure /> : <>{this.props.children}</>;
  }
}
