"use client";

import type { IssueStatus, ProjectSummary } from "@kenkaiiii/error-mom-protocol";
import { useRouter } from "next/navigation";

export function ProjectSelector({
  projects,
  selectedProjectId,
  status,
}: {
  projects: ProjectSummary[];
  selectedProjectId: string;
  status: IssueStatus | "unresolved" | "all";
}) {
  const router = useRouter();
  const totalOpenIssues = projects.reduce((total, project) => total + project.openIssues, 0);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  // The number is the unresolved-issue count, not the project count. Label it
  // outside the select so the closed control never truncates the meaning.
  const scopeCount = selectedProject ? selectedProject.openIssues : totalOpenIssues;
  const scopeLabel = selectedProject
    ? `${scopeCount} unresolved`
    : `${scopeCount} unresolved in ${projects.length} project${projects.length === 1 ? "" : "s"}`;

  function selectProject(projectId: string) {
    const parameters = new URLSearchParams();
    if (projectId) parameters.set("project", projectId);
    if (status !== "unresolved") parameters.set("status", status);
    const query = parameters.toString();
    router.push(query ? `/?${query}` : "/");
  }

  return (
    <div className="project-selector">
      <label htmlFor="project-selector">Projects</label>
      <div className="select-control">
        <select
          id="project-selector"
          value={selectedProjectId}
          onChange={(event) => selectProject(event.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <p className="project-selector-count">{scopeLabel}</p>
    </div>
  );
}
