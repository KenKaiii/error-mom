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
    </div>
  );
}
