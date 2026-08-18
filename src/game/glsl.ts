// @ts-nocheck
/**
 * glsl.ts — shared GLSL noise + helpers, prepended to every procedural shader
 * that needs them. Everything visible is generated; there are no textures.
 */

export const NOISE_GLSL = /* glsl */ `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
vec3 hash33(vec3 p3){
  p3 = fract(p3*vec3(0.1031,0.1030,0.0973));
  p3 += dot(p3, p3.yzx+33.33);
  return fract((p3.xxy+p3.yzz)*p3.zyx);
}

// Value noise — linearly interpolated so lightning keeps its corners.
float vnoise2(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 a = hash22(i);
  vec2 b = hash22(i+vec2(1.0,0.0));
  vec2 c = hash22(i+vec2(0.0,1.0));
  vec2 d = hash22(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a.x,b.x,u.x), mix(c.x,d.x,u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash33(i+vec3(0,0,0)).x;
  float n100 = hash33(i+vec3(1,0,0)).x;
  float n010 = hash33(i+vec3(0,1,0)).x;
  float n110 = hash33(i+vec3(1,1,0)).x;
  float n001 = hash33(i+vec3(0,0,1)).x;
  float n101 = hash33(i+vec3(1,0,1)).x;
  float n011 = hash33(i+vec3(0,1,1)).x;
  float n111 = hash33(i+vec3(1,1,1)).x;
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y), f.z);
}
float fbm2(vec2 p){
  float v = 0.0; float a = 0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ v += a*vnoise2(p); p = m*p; a *= 0.5; }
  return v;
}
float fbm3(vec3 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++){ v += a*vnoise3(p); p = p*2.02; a *= 0.5; }
  return v;
}
// 2D cellular / voronoi for frost plates and crack networks.
vec2 voronoi2(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float minD = 8.0; float minE = 8.0;
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 g = vec2(float(x),float(y));
      vec2 o = hash22(i+g);
      o = 0.5+0.5*sin(6.2831*o);
      vec2 r = g+o-f;
      float d = dot(r,r);
      if(d<minD){ minE=minD; minD=d; }
      else if(d<minE){ minE=d; }
    }
  }
  return vec2(sqrt(minD), sqrt(minE));
}
`;

/** Standard SDF primitives, in metres, for the aim indicators. */
export const SDF_GLSL = /* glsl */ `
float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p)-b+r;
  return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;
}
// iq's exact triangle SDF.
float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0 = b-a, e1 = c-b, e2 = a-c;
  vec2 v0 = p-a, v1 = p-b, v2 = p-c;
  vec2 pq0 = v0 - e0*clamp(dot(v0,e0)/dot(e0,e0),0.0,1.0);
  vec2 pq1 = v1 - e1*clamp(dot(v1,e1)/dot(e1,e1),0.0,1.0);
  vec2 pq2 = v2 - e2*clamp(dot(v2,e2)/dot(e2,e2),0.0,1.0);
  float s = sign(e0.x*e2.y - e0.y*e2.x);
  vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y-v0.y*e0.x)),
                  vec2(dot(pq1,pq1), s*(v1.x*e1.y-v1.y*e1.x))),
                  vec2(dot(pq2,pq2), s*(v2.x*e2.y-v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
`;
