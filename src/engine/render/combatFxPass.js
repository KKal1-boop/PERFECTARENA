// A foreign GL pass using the same state contract as Daggerfall's precipitation renderer.
import { buildProgram } from './glProgram.js';
import { FX_MAX_VERTICES } from '../../game/combatFx.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec4 aColour;
uniform mat4 uProj;
uniform mat4 uView;
out vec4 vColour;
void main() { gl_Position = uProj * uView * vec4(aPosition, 1.0); vColour = aColour; }`;
const FS = `#version 300 es
precision highp float;
in vec4 vColour;
out vec4 outColour;
void main() { outColour = vColour; }`;

export class CombatFxPass {
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, VS, FS, 'Arena combat effects');
    this.proj = gl.getUniformLocation(this.program, 'uProj');
    this.view = gl.getUniformLocation(this.program, 'uView');
    this.vao = gl.createVertexArray(); this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, FX_MAX_VERTICES * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  }
  draw(vertices, proj, view) {
    if (!vertices.length) return;
    const gl = this.gl;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.uniformMatrix4fv(this.proj, false, proj); gl.uniformMatrix4fv(this.view, false, view);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 7);
    gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }
  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
  }
}
