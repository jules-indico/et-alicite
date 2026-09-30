import { StatusTasksView } from "@/components/tasks-flat-list"

export default function CompletedTasksPage() {
  return (
    <StatusTasksView
      status="Completed"
      heading="Completed tasks"
      description="Every completed research task across all assignees in this group."
    />
  )
}
