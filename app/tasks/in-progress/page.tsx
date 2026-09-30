import { StatusTasksView } from "@/components/tasks-flat-list"

export default function InProgressTasksPage() {
  return (
    <StatusTasksView
      status="In progress"
      heading="In progress tasks"
      description="Every in-progress research task across all assignees in this group."
    />
  )
}
