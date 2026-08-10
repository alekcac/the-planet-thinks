import { describe, it, expect } from 'vitest';
import { parseLangFilter, parseView, parseFollowOff } from '../src/url-params';

describe('parseLangFilter', () => {
  it('returns null without the param', () => {
    expect(parseLangFilter('')).toBeNull();
    expect(parseLangFilter('?cinematic')).toBeNull();
  });
  it('parses a single code and a comma list', () => {
    expect([...parseLangFilter('?lang=de')!]).toEqual(['de']);
    expect([...parseLangFilter('?lang=de,fr, EN')!].sort()).toEqual(['de', 'en', 'fr']);
  });
  it('accepts real wiki subdomains and drops garbage', () => {
    expect([...parseLangFilter('?lang=zh-yue,simple,be-tarask')!].sort())
      .toEqual(['be-tarask', 'simple', 'zh-yue']);
    expect(parseLangFilter('?lang=<script>,,%20')).toBeNull();
  });
});

describe('parseView', () => {
  it('returns null without the param or on garbage', () => {
    expect(parseView('')).toBeNull();
    expect(parseView('?view=paris')).toBeNull();
    expect(parseView('?view=91,0')).toBeNull();
    expect(parseView('?view=0,181')).toBeNull();
  });
  it('parses lat,lng with the default altitude', () => {
    expect(parseView('?view=48.9,2.3', 2.4)).toEqual({ lat: 48.9, lng: 2.3, altitude: 2.4 });
  });
  it('clamps the explicit altitude', () => {
    expect(parseView('?view=51,10,0.1')!.altitude).toBe(0.3);
    expect(parseView('?view=51,10,99')!.altitude).toBe(5);
    expect(parseView('?view=51,10,1.6')!.altitude).toBe(1.6);
  });
});

describe('parseFollowOff', () => {
  it('only trips on explicit off values', () => {
    expect(parseFollowOff('?follow=off')).toBe(true);
    expect(parseFollowOff('?follow=0')).toBe(true);
    expect(parseFollowOff('?follow=false')).toBe(true);
    expect(parseFollowOff('?follow=on')).toBe(false);
    expect(parseFollowOff('')).toBe(false);
  });
});
