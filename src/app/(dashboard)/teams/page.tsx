import { Users, UserPlus, Shield, MoreHorizontal } from "lucide-react";

export default function TeamsPage() {
  const members = [
    { name: "Ronald (You)", email: "ronald@killio.app", role: "Owner", status: "Online", avatar: "RO" },
    { name: "Alice Johnson", email: "alice@killio.app", role: "Admin", status: "Offline", avatar: "AJ" },
    { name: "Bob Smith", email: "bob@killio.app", role: "Member", status: "Online", avatar: "BS" },
    { name: "Charlie Davis", email: "charlie@killio.app", role: "Guest", status: "Offline", avatar: "CD" },
  ];

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Teams & Access</h1>
          <p className="text-muted-foreground">Manage your team members and their permissions across the workspace.</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group">
          <UserPlus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
          Invite People
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border/50 bg-background/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <input 
              type="text" 
              placeholder="Filter members..." 
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{members.length} members</span>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {members.map((member, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-card hover:bg-accent/5 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full border border-border bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-xs shadow-sm">
                  {member.avatar}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium leading-none text-foreground">{member.name}</p>
                    {member.status === "Online" && (
                      <span className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-background"></span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center">
                  <Shield className="h-3 w-3 mr-1.5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{member.role}</span>
                </div>
                <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
