import { StatusTasksView } from "@/components/tasks-flat-list"

export default function AllTasksPage() {
  return (
    <StatusTasksView
      status={null}
      heading="All tasks"
      description="Every research task in this group, regardless of status or assignee."
    />
  )
}
