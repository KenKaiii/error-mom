import type { IssueStatus, ProjectSummary } from "@kenkaiiii/error-mom-protocol";
import { ProjectCreator } from "@/components/ProjectCreator";
import { ProjectSelector } from "@/components/ProjectSelector";

export function ProjectRail({
  projects,
  selectedProjectId,
  status = "unresolved",
}: {
  projects: ProjectSummary[];
  selectedProjectId: string;
  status?: IssueStatus | "unresolved" | "all";
}) {
  return (
    <aside className="project-rail" aria-label="Project scope">
      <ProjectSelector projects={projects} selectedProjectId={selectedProjectId} status={status} />
      <ProjectCreator />
    </aside>
  );
}
