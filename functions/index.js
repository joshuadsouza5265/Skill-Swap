const {onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
setGlobalOptions({maxInstances:10,region:'asia-south1'});

async function award(uid, points, reason, sourceId){
  const userRef=db.doc(`users/${uid}`);
  const eventRef=db.collection('pointEvents').doc();
  await db.runTransaction(async tx=>{
    const uSnap=await tx.get(userRef);
    if(!uSnap.exists) return;
    const u=uSnap.data();
    const today=new Date().toISOString().slice(0,10);
    const last=u.lastActivity||null;
    let streak=Number(u.streak||0);
    let bonus=0;
    if(last!==today){
      const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
      streak=last===yesterday?streak+1:1;
      if(streak%7===0) bonus=10;
    }
    tx.update(userRef,{points:Number(u.points||0)+points+bonus,streak,lastActivity:today});
    tx.set(eventRef,{userId:uid,points,reason,sourceId,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    if(bonus){
      const bonusRef=db.collection('pointEvents').doc();
      tx.set(bonusRef,{userId:uid,points:bonus,reason:'7-day learning streak bonus',sourceId,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    }
  });
}

exports.rewardCompletedSession=onDocumentUpdated('sessions/{sessionId}',async event=>{
  const before=event.data.before.data(), after=event.data.after.data();
  if(before.status==='completed'||after.status!=='completed') return;
  for(const uid of after.userIds||[]) await award(uid,50,'Completed learning session',event.params.sessionId);
});

exports.rewardCompletedAssignment=onDocumentUpdated('assignments/{assignmentId}',async event=>{
  const before=event.data.before.data(), after=event.data.after.data();
  if(before.completed===true||after.completed!==true) return;
  await award(after.userId,25,'Completed assignment',event.params.assignmentId);
});
