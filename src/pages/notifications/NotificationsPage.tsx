import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type StudentNotification } from "@/services/competitions/competitionService";

export function NotificationsPage() {
  const {showToast}=useToast();
  const [items,setItems]=useState<StudentNotification[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>setItems(await listMyNotifications()),[]);
  useEffect(()=>{void refresh().catch(e=>showToast(e instanceof Error?e.message:"Couldn't load notifications.","error")).finally(()=>setLoading(false));},[refresh,showToast]);
  async function markOne(id:string){try{await markNotificationRead(id);setItems(current=>current.map(item=>item.id===id?{...item,is_read:true}:item));}catch(e){showToast(e instanceof Error?e.message:"Couldn't mark notification as read.","error");}}
  async function markAll(){setBusy(true);try{await markAllNotificationsRead();setItems(current=>current.map(item=>({...item,is_read:true})));showToast("All notifications marked as read.","success");}catch(e){showToast(e instanceof Error?e.message:"Couldn't update notifications.","error");}finally{setBusy(false);}}
  const unread=items.filter(item=>!item.is_read).length;
  return <div className="container" style={{paddingBlock:"var(--space-8)",display:"grid",gap:"var(--space-4)"}}>
    <header className="cluster" style={{justifyContent:"space-between",flexWrap:"wrap"}}><div><Badge tone="accent">YOUR UPDATES</Badge><h1 style={{fontSize:"var(--text-2xl)",marginBlock:"var(--space-2)"}}>Notifications</h1><p style={{color:"var(--text-secondary)"}}>Competition, tournament and result updates in one place.</p></div><Button variant="secondary" onClick={()=>void markAll()} disabled={unread===0||busy} isLoading={busy}><CheckCheck size={16}/>Mark all read</Button></header>
    {loading?<SkeletonText lines={6}/>:items.length===0?<GlassCard><EmptyState icon={Bell} title="You're all caught up" description="New competition, tournament and result updates will appear here."/></GlassCard>:items.map(item=><GlassCard key={item.id} padding="var(--space-4)"><div className="cluster" style={{alignItems:"flex-start",gap:"var(--space-3)"}}><div style={{width:40,height:40,borderRadius:"var(--radius-md)",display:"grid",placeItems:"center",background:"var(--bg-glass)",color:"var(--accent-cyan)",flexShrink:0}}><Trophy size={18}/></div><div style={{flex:1,minWidth:0}}><div className="cluster" style={{justifyContent:"space-between",alignItems:"flex-start",gap:"var(--space-2)"}}><strong>{item.title}</strong>{!item.is_read&&<Badge tone="accent">New</Badge>}</div>{item.body&&<p style={{color:"var(--text-secondary)",marginBlock:"var(--space-2)"}}>{item.body}</p>}<span style={{color:"var(--text-muted)",fontSize:"var(--text-xs)"}}>{new Date(item.created_at).toLocaleString()}</span></div>{!item.is_read&&<Button size="sm" variant="ghost" onClick={()=>void markOne(item.id)}>Mark read</Button>}</div></GlassCard>)}
    <p style={{color:"var(--text-muted)",fontSize:"var(--text-xs)"}}>These are in-app notifications. Email, browser push and WhatsApp delivery are separate channels and are not enabled by this page.</p>
  </div>;
}
