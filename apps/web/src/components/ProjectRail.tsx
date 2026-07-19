import type { IssueStatus, ProjectSummary } from "@kenkaiiii/error-mom-protocol";
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
      {projects.length === 0 ? (
        <p className="project-rail-hint">
          Projects appear here when a coding agent runs <code>error-mom init</code> inside an app.
        </p>
      ) : null}
    </aside>
  );
}
