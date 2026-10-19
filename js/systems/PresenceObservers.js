'use strict';
// Um único registro dos predicados reais; a guarda não conhece puzzles e nunca altera o corpo.
class PresenceObservers{
  constructor(game,guard=new ProgressionGuard()){this.g=game;this.guard=guard;this.reset();}
  static inRegions(pos,zones,margin=0){
    return zones.filter(Boolean).some(z=>{
      if(pos.y<z.minY-margin||pos.y>z.maxY+margin||pos.x<z.minX-margin||pos.x>z.maxX+margin||pos.z<z.minZ-margin||pos.z>z.maxZ+margin)return false;
      if(!z.arc)return true;
      const inside=arcIn(z.arc,pos.x,pos.z,0),d=_arcBoundaryDistance(z.arc,pos.x,pos.z);
      return margin>=0?(inside||d<margin):(inside&&d>=-margin);
    });
  }
  reset(){this.guard.reset();this.g.player.trackNormalMotion=true;this.g.player.consumeNormalMotion();this.frame=this.sample();}
  sample(){
    const g=this.g,w=g.world,p=g.player.position,frame=new Map();
    const put=(id,readRaw,contains)=>frame.set(id,{inside:contains(p),values:readRaw(),contains,readRaw});
    for(const cp of w.checkpoints){
      const contains=(q,m=0)=>cp.bounds?Math.abs(q.y-cp.bounds.top)<.6+m&&solidInXZ(cp.bounds,q.x,q.z,RAD+.02+m):cp.position.distanceTo(q)<=cp.radius+.3+m;
      put('checkpoint:'+cp.id,()=>g.checkpoints.presenceAt(cp,g.player.position),contains);
    }
    if(w.finish){const f=w.finish;put('finish',()=>g.checkpoints.finishPresenceAt(g.player.position),(q,m=0)=>Math.abs(q.y-f.position.y)<.8+m&&Math.hypot(q.x-f.position.x,q.z-f.position.z)<=f.radius+.3+m);}
    for(const puzzle of g.puzzles.puzzles){
      const R=puzzle.room;
      if(puzzle instanceof HallPuzzle){put('hall:'+puzzle.id,()=>puzzle.presenceAt(g.player.position),(q,m=0)=>PresenceObservers.inRegions(q,puzzle.insideZones(),m));
        if(puzzle.logic instanceof HubLogic){const z=R.zones&&R.zones[0];put('hub:'+puzzle.id+':power-entry',()=>puzzle.logic.presenceAt(g.player.position),(q,m=0)=>PresenceObservers.inRegions(q,[z],m));}
      }else if(puzzle instanceof MazePuzzle)put('maze:'+puzzle.id,()=>puzzle.presenceAt(g.player.position),(q,m=0)=>PresenceObservers.inRegions(q,[R.zoneRoom,R.zoneDuct,R.zoneExit],m));
      else if(puzzle instanceof ContainmentPuzzle)put('containment:'+puzzle.id,()=>puzzle.presenceAt(g.player.position),(q,m=0)=>PresenceObservers.inRegions(q,[R.zoneRoom,R.zoneDuct],m));
    }
    const S=w.mazeScr;if(S)put('maze-screen:mz300',()=>w.mazePresenceAt(g.player.position),(q,m=0)=>new V3(q.x,q.y+EYE,q.z).distanceTo(S.center)<S.near+.3+m);
    put('mass:height',()=>({above:g.player.position.y>1.6}),q=>q.y>1.6);
    return frame;
  }
  update(motion={segments:[]}){this.frame=this.guard.advance(this.sample(),motion);}
  read(id){const s=this.frame.get(id);if(!s)return null;const protectedNow=this.guard.isProtected(id);return {...(protectedNow?s.values:s.readRaw()),$protected:protectedNow};}
}
