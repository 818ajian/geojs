//////////////////////////////////////////////////////////////////////////////
/**
 * @module geo.gl
 */
//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
/**
 * Create a new instance of lineFeature
 *
 * @class
 * @returns {ggl.lineFeature}
 */
//////////////////////////////////////////////////////////////////////////////
ggl.lineFeature = function (arg) {
  'use strict';
  if (!(this instanceof ggl.lineFeature)) {
    return new ggl.lineFeature(arg);
  }
  arg = arg || {};
  geo.lineFeature.call(this, arg);

  ////////////////////////////////////////////////////////////////////////////
  /**
   * @private
   */
  ////////////////////////////////////////////////////////////////////////////
  var m_this = this,
      m_actor = null,
      m_mapper = null,
      m_material = null,
      s_init = this._init,
      s_update = this._update;

  function createVertexShader() {
      var vertexShaderSource = [
        'attribute vec3 pos;',
        'attribute vec3 prev;',
        'attribute vec3 next;',
        'attribute float offset;',

        'attribute vec3 strokeColor;',
        'attribute float strokeOpacity;',
        'attribute float strokeWidth;',

        'uniform mat4 modelViewMatrix;',
        'uniform mat4 projectionMatrix;',
        'uniform float pixelWidth;',

        'varying vec3 strokeColorVar;',
        'varying float strokeWidthVar;',
        'varying float strokeOpacityVar;',

        'void main(void)',
        '{',
        ' float precThreshold = 0.0001;',
        '  vec4 worldPos = projectionMatrix * modelViewMatrix * vec4(pos.xyz, 1);',
        '  if (worldPos.w != 0.0) {',
        '    worldPos = worldPos/worldPos.w;',
        '  }',
        '  vec4 worldNext = projectionMatrix * modelViewMatrix * vec4(next.xyz, 1);',
        '  if (worldNext.w != 0.0) {',
        '    worldNext = worldNext/worldNext.w;',
        '  }',
        '  vec4 worldPrev = projectionMatrix* modelViewMatrix * vec4(prev.xyz, 1);',
        '  if (worldPrev.w != 0.0) {',
        '    worldPrev = worldPrev/worldPrev.w;',
        '  }',
        '  strokeColorVar = strokeColor;',
        '  strokeWidthVar = strokeWidth;',
        '  strokeOpacityVar = strokeOpacity;',
        '  vec2 deltaNext = worldNext.xy - worldPos.xy;',
        '  vec2 deltaPrev = worldPos.xy - worldPrev.xy;',
        '  float angleNext = 0.0;',
        '  if (abs(deltaNext.x) > precThreshold)',
        '  {',
        '    angleNext = atan(deltaNext.y, deltaNext.x);',
        '  }',
        '  float anglePrev = 0.0;',
        '  if (abs(deltaPrev.x) > precThreshold)',
        '  {',
        '    anglePrev = atan(deltaPrev.y, deltaPrev.x);',
        '  }',
        '  if (deltaPrev.xy == vec2(0, 0)) anglePrev = angleNext;',
        '  if (deltaNext.xy == vec2(0, 0)) angleNext = anglePrev;',
        '  float angle = (anglePrev + angleNext) / 2.0;',
        '  float distance = (offset * strokeWidth * pixelWidth) /',
        '                    cos(anglePrev - angle);',
        '  worldPos.x += distance * sin(angle);',
        '  worldPos.y -= distance * cos(angle);',
        '  vec4  p = worldPos;',
        '  gl_Position = p;',
        '}'
      ].join('\n'),
      shader = new vgl.shader(gl.VERTEX_SHADER);
      shader.setShaderSource(vertexShaderSource);
      return shader;
    }

  function createFragmentShader() {
    var fragmentShaderSource = [
      '#ifdef GL_ES',
      '  precision highp float;',
      '#endif',
      'varying vec3 strokeColorVar;',
      'varying float strokeWidthVar;',
      'varying float strokeOpacityVar;',
      'void main () {',
      '  gl_FragColor = vec4 (strokeColorVar, strokeOpacityVar);',
      '}'
    ].join('\n'),
    shader = new vgl.shader(gl.FRAGMENT_SHADER);
    shader.setShaderSource(fragmentShaderSource);
    return shader;
  }

  function createGLLines() {
    var i = null,
        prev = [],
        next = [],
        numPts = m_this.data().length,
        itemIndex = 0,
        lineItemIndex = 0,
        lineItem = null,
        currIndex = null,
        pos = null,
        posTmp = null,
        strkColor = null,
        start = null,
        position = [],
        strkWidthArr = [],
        strkColorArr = [],
        strkOpacityArr = [],
        geom = vgl.geometryData(),
        posFunc = m_this.position(),
        strkWidthFunc = m_this.style.get('strokeWidth'),
        strkColorFunc = m_this.style.get('strokeColor'),
        strkOpacityFunc = m_this.style.get('strokeOpacity'),
        buffers = vgl.DataBuffers(1024),
        // Sources
        posData = vgl.sourceDataP3fv(),
        prvPosData = vgl.sourceDataAnyfv(3, vgl.vertexAttributeKeysIndexed.Four),
        nxtPosData = vgl.sourceDataAnyfv(3, vgl.vertexAttributeKeysIndexed.Five),
        offPosData = vgl.sourceDataAnyfv(1, vgl.vertexAttributeKeysIndexed.Six),
        strkWidthData = vgl.sourceDataAnyfv(1, vgl.vertexAttributeKeysIndexed.One),
        strkColorData = vgl.sourceDataAnyfv(3, vgl.vertexAttributeKeysIndexed.Two),
        strkOpacityData = vgl.sourceDataAnyfv(1, vgl.vertexAttributeKeysIndexed.Three),
        // Primitive indices
        triangles = vgl.triangles();

    m_this.data().forEach(function (item) {
      lineItem = m_this.line()(item, itemIndex);
      lineItem.forEach(function (lineItemData) {
        pos = posFunc(item, itemIndex, lineItemData, lineItemIndex);
        if (pos instanceof geo.latlng) {
          position.push([pos.x(), pos.y(), 0.0]);
        } else {
          position.push([pos.x, pos.y, pos.z || 0.0]);
        }
        strkWidthArr.push(strkWidthFunc(item, itemIndex,
                                        lineItemData, lineItemIndex));
        strkColor = strkColorFunc(item, itemIndex,
                                  lineItemData, lineItemIndex);
        strkColorArr.push([strkColor.r, strkColor.g, strkColor.b]);
        strkOpacityArr.push(strkOpacityFunc(item, itemIndex,
                                            lineItemData, lineItemIndex));

        // Assuming that we will have atleast two points
        if (lineItemIndex === 0) {
          posTmp = position[position.length - 1];
          prev.push(posTmp);
          position.push(posTmp);
          prev.push(posTmp);
          next.push(posTmp);
          strkWidthArr.push(strkWidthFunc(item, itemIndex,
                                          lineItemData, lineItemIndex));
          strkOpacityArr.push(strkOpacityFunc(item, itemIndex,
                                              lineItemData, lineItemIndex));
          strkColorArr.push([strkColor.r, strkColor.g, strkColor.b]);
        }
        else {
          prev.push(position[position.length - 2]);
          next.push(position[position.length - 1]);
        }

        lineItemIndex += 1;
      });
      next.push(position[position.length - 1]);
      lineItemIndex = 0;
      itemIndex += 1;
    });

    position = geo.transform.transformCoordinates(
                 m_this.gcs(), m_this.layer().map().gcs(),
                 position, 3);
    prev = geo.transform.transformCoordinates(
                 m_this.gcs(), m_this.layer().map().gcs(),
                 prev, 3);
    next = geo.transform.transformCoordinates(
                 m_this.gcs(), m_this.layer().map().gcs(),
                 next, 3);

    buffers.create('pos', 3);
    buffers.create('next', 3);
    buffers.create('prev', 3);
    buffers.create('offset', 1);
    buffers.create('indices', 1);
    buffers.create('strokeWidth', 1);
    buffers.create('strokeColor', 3);
    buffers.create('strokeOpacity', 1);

    numPts = position.length;

    start = buffers.alloc(numPts * 6);
    currIndex = start;

    for (i = 0; i < numPts; i += 1) {
      //buffers.write('indices', [i], start + i, 1);
      buffers.repeat('strokeWidth', [strkWidthArr[i]], start + i * 6, 6);
      buffers.repeat('strokeColor', strkColorArr[i], start + i * 6, 6);
      buffers.repeat('strokeOpacity', [strkOpacityArr[i]], start + i * 6, 6);
    }

    var addVert = function (p, c, n, offset) {
      buffers.write('prev', p, currIndex, 1);
      buffers.write('pos', c, currIndex, 1);
      buffers.write('next', n, currIndex, 1);
      buffers.write('offset', [offset], currIndex, 1);
      buffers.write('indices', [currIndex], currIndex, 1);
      currIndex += 1;
    };

    for (i = 1; i < position.length; i += 1) {
      //buffers.write ('unit', unit_buffer, currentIndex, 6);
      addVert(prev[i - 1], position[i - 1], next[i - 1], 1);
      addVert(prev[i], position[i], next[i], -1);
      addVert(prev[i - 1], position[i - 1], next[i - 1], -1);

      addVert(prev[i - 1], position[i - 1], next[i - 1], 1);
      addVert(prev[i], position[i], next[i], 1);
      addVert(prev[i], position[i], next[i], -1);
    }

    posData.pushBack(buffers.get('pos'));
    geom.addSource(posData);

    prvPosData.pushBack(buffers.get('prev'));
    geom.addSource(prvPosData);

    nxtPosData.pushBack(buffers.get('next'));
    geom.addSource(nxtPosData);

    strkWidthData.pushBack(buffers.get('strokeWidth'));
    geom.addSource(strkWidthData);

    strkColorData.pushBack(buffers.get('strokeColor'));
    geom.addSource(strkColorData);

    strkOpacityData.pushBack(buffers.get('strokeOpacity'));
    geom.addSource(strkOpacityData);

    offPosData.pushBack(buffers.get('offset'));
    geom.addSource(offPosData);

    triangles.setIndices(buffers.get('indices'));
    geom.addPrimitive(triangles);

    m_mapper.setGeometryData(geom);
  }

  ////////////////////////////////////////////////////////////////////////////
  /**
   * Initialize
   */
  ////////////////////////////////////////////////////////////////////////////
  this._init = function (arg) {
    var prog = vgl.shaderProgram(),
        vs = createVertexShader(),
        fs = createFragmentShader(),
        // Vertex attributes
        posAttr = vgl.vertexAttribute('pos'),
        prvAttr = vgl.vertexAttribute('prev'),
        nxtAttr = vgl.vertexAttribute('next'),
        offAttr = vgl.vertexAttribute('offset'),
        strkWidthAttr = vgl.vertexAttribute('strokeWidth'),
        strkColorAttr = vgl.vertexAttribute('strokeColor'),
        strkOpacityAttr = vgl.vertexAttribute('strokeOpacity'),
        // Shader uniforms
        mviUnif = new vgl.modelViewUniform('modelViewMatrix'),
        prjUnif = new vgl.projectionUniform('projectionMatrix'),
        pwiUnif = new vgl.floatUniform('pixelWidth',
                    2.0 / m_this.renderer().width()),
        // Accessors
        swiFunc = m_this.style.get('strokeWidth'),
        scoFunc = m_this.style.get('strokeColor'),
        sopFunc = m_this.style.get('strokeOpacity');

    s_init.call(m_this, arg);
    m_material = vgl.material();
    m_mapper = vgl.mapper();

    prog.addVertexAttribute(posAttr, vgl.vertexAttributeKeys.Position);
    prog.addVertexAttribute(strkWidthAttr, vgl.vertexAttributeKeysIndexed.One);
    prog.addVertexAttribute(strkColorAttr, vgl.vertexAttributeKeysIndexed.Two);
    prog.addVertexAttribute(strkOpacityAttr, vgl.vertexAttributeKeysIndexed.Three);
    prog.addVertexAttribute(prvAttr, vgl.vertexAttributeKeysIndexed.Four);
    prog.addVertexAttribute(nxtAttr, vgl.vertexAttributeKeysIndexed.Five);
    prog.addVertexAttribute(offAttr, vgl.vertexAttributeKeysIndexed.Six);

    prog.addUniform(mviUnif);
    prog.addUniform(prjUnif);
    prog.addUniform(pwiUnif);

    prog.addShader(fs);
    prog.addShader(vs);

    m_material.addAttribute(prog);
    m_material.addAttribute(vgl.blend());

    m_actor = vgl.actor();
    m_actor.setMaterial(m_material);
    m_actor.setMapper(m_mapper);
  };

  ////////////////////////////////////////////////////////////////////////////
  /**
   * Build
   *
   * @override
   */
  ////////////////////////////////////////////////////////////////////////////
  this._build = function () {
    if (m_actor) {
      m_this.renderer().contextRenderer().removeActor(m_actor);
    }

    createGLLines();

    m_this.renderer().contextRenderer().addActor(m_actor);
    m_this.buildTime().modified();
  };

  ////////////////////////////////////////////////////////////////////////////
  /**
   * Update
   *
   * @override
   */
  ////////////////////////////////////////////////////////////////////////////
  this._update = function () {
    s_update.call(m_this);

    if (m_this.dataTime().getMTime() >= m_this.buildTime().getMTime() ||
        m_this.updateTime().getMTime() <= m_this.getMTime()) {
      m_this._build();
    }

    m_actor.setVisible(m_this.visible());
    m_actor.material().setBinNumber(m_this.bin());
    m_this.updateTime().modified();
  };

  ////////////////////////////////////////////////////////////////////////////
  /**
   * Destroy
   */
  ////////////////////////////////////////////////////////////////////////////
  this._exit = function () {
    m_this.renderer().contextRenderer().removeActor(m_actor);
  };

  this._init(arg);
  return this;
};

inherit(ggl.lineFeature, geo.lineFeature);

// Now register it
geo.registerFeature('vgl', 'line', ggl.lineFeature);
