import { useState, type ReactNode } from "react";
import { AtlasUploaderProvider, type AtlasUploader } from "../../atlas";
import { fakeUploader } from "./fakeUploader";

export interface TestAtlasProviderProps {
  readonly uploader?: AtlasUploader;
  readonly children?: ReactNode;
}

export function TestAtlasProvider({ uploader, children }: TestAtlasProviderProps) {
  const [fallback] = useState(() => fakeUploader());
  return <AtlasUploaderProvider uploader={uploader ?? fallback}>{children}</AtlasUploaderProvider>;
}
