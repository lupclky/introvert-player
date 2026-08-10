(function attachPlaybackController(g){'use strict';class PlaybackController{
 constructor(o={}){this.control=o.control||(()=>{});this.playNext=o.playNext||(()=>{});this.update=o.update||(()=>{});}
 toggle(state){if(!state.currentSong)return{action:'none'};const playing=!state.isPlaying;state.isPlaying=playing;this.control(playing?'play':'pause');this.update(playing);return{action:playing?'play':'pause',playing};}
 skip(state,{manual=true,nextSong=null,completedSong=null}={}){state.lastSwitchTime=Date.now();this.control('stop');this.playNext(!manual,nextSong,completedSong);return{action:'skip',manual};}
 seek(percent,duration){const value=Math.max(0,Math.min(100,Number(percent)||0));const seconds=(Math.max(0,Number(duration)||0)*value)/100;this.control('seek',seconds);return seconds;}
 volume(state,value){const volume=Math.max(0,Math.min(100,Number(value)||0));state.volume=volume;this.control('volume',volume);return volume;}
}g.PlaybackController=PlaybackController;if(typeof module!=='undefined'&&module.exports)module.exports=PlaybackController;})(typeof window!=='undefined'?window:globalThis);
