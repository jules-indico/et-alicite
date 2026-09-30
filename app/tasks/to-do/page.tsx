import { StatusTasksView } from "@/components/tasks-flat-list"

export default function TodoTasksPage() {
  return (
    <StatusTasksView
      status="To do"
      heading="To do tasks"
      description="Every to-do research task across all assignees in this group."
    />
  )
}
